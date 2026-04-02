const hh = require('hardhat')
const ethers = hh.ethers
const { send, want, snapshot, revert, b32, fail } = require('./utils/minihat')

const { check_gas, padRight, check_entry, testlib } = require('./utils/helpers')
const { bounds } = require('./bounds')
const lib = require('../dmap.js')

const debug = require('debug')('dmap:test')

describe('dmap', ()=>{
    let dpack
    let dmap
    let rootzone
    let freezone

    let ali, bob, cat
    let ALI, BOB, CAT
    const LOCK = `0x${'00'.repeat(31)}01`

    let dmapi_abi
    let dmap_i

    before(async ()=>{
        dpack = await import('@cryptosdao/dpack');
        [ali, bob, cat] = await ethers.getSigners();
        [ALI, BOB, CAT] = [ali, bob, cat].map(x => x.address)

        dmapi_abi = (await hh.artifacts.readArtifact('Dmap')).abi
        dmap_i = new ethers.Interface(dmapi_abi)

        const pack = await hh.run('dmap-mock-deploy')
        const dapp = await dpack.load(pack, hh.ethers, ali)
        dmap = dapp.dmap
        rootzone = dapp.rootzone
        freezone = dapp.freezone
        await snapshot(hh)
    })
    beforeEach(async ()=>{
        await revert(hh)
    })

    it('deploy postconditions', async ()=>{
        const dmap_ref = await rootzone.dmap()
        want(dmap_ref).eq(await dmap.getAddress())

        await check_entry(dmap, ALI, b32('1'), ethers.ZeroHash, ethers.ZeroHash)
        await check_entry(dmap, BOB, b32('1'), ethers.ZeroHash, ethers.ZeroHash)

        const dmapAddr = await dmap.getAddress()
        const provider = dmap.runner.provider
        const rootData = await provider.getStorage(dmapAddr, 1)
        const rootMeta = await provider.getStorage(dmapAddr, 0)
        want(ethers.dataSlice(rootData, 0, 20))
            .to.eql((await rootzone.getAddress()).toLowerCase())
        want(rootMeta).to.eql(LOCK)
    })

    it('address padding', async ()=> {
        const [root_self_meta, root_self] = await lib.get(dmap, await rootzone.getAddress(), b32('root'))
    })

    const expectLog = async (dmap, eventname, caller, name, meta, data, isAnon = false) => {
        const _logs = dmap.filters[eventname](caller, name, meta, data)
        const logs = await dmap.queryFilter(_logs, 0)
        want(logs.length).to.eql(1)
        const log = logs[0]

        if (isAnon) {
            // In ethers v6, anonymous events have no event name in the log
            // The fragment is still present but the event is decoded differently
        }
    }

    it('basic set', async () => {
        const name = '0x'+'11'.repeat(32)
        const meta = '0x'+'1'+'0'.repeat(63)
        const data = '0x'+'22'.repeat(32)
        await send(lib.set, dmap, name, meta, data)

        await expectLog(dmap, "Set", ALI, name, meta, data, true)

        await check_entry(dmap, ALI, name, meta, data)
    })

    it('event filter', async () => {
        const name = '0x'+'81'.repeat(32)
        const meta = '0x'+'f3'.repeat(32)
        const data = '0x'+'33'.repeat(32)
        await send(lib.set, dmap.connect(bob), name, meta, data)

        await expectLog(dmap, "Set", BOB, name, meta, data, true)
    })

    describe('event data no overlap', () => {
        const keys = ['name', 'meta', 'data', 'zone']
        for (let i = 0; i < keys.length; i++) {
            let words = {}
            words.name = words.meta = words.data = ethers.ZeroHash
            words.zone = ethers.ZeroAddress
            words[keys[i]] = '0x' + 'ff'.repeat(keys[i] == 'zone' ? 20 : 32)
            it('set ' + keys[i], async () => {
                // Use hardhat impersonation instead of smock
                await hh.network.provider.request({
                    method: "hardhat_impersonateAccount",
                    params: [words.zone]
                })
                await hh.network.provider.send("hardhat_setBalance", [words.zone, "0xDE0B6B3A7640000"])
                const fakeSigner = await ethers.getSigner(words.zone)

                await send(lib.set, dmap.connect(fakeSigner), words.name, words.meta, words.data)

                expectLog(dmap, "Set", words.zone, words.name, words.meta, words.data, true)

                await check_entry(dmap, words.zone, words.name, words.meta, words.data)

                await hh.network.provider.request({
                    method: "hardhat_stopImpersonatingAccount",
                    params: [words.zone]
                })
            })
        }
    })

    describe('hashing', () => {
        it("zone in hash", async () => {
            const alival = '0x' + '11'.repeat(32)
            const bobval = '0x' + 'ff'.repeat(32)
            await send(lib.set, dmap, b32("1"), LOCK, alival)
            await send(lib.set, dmap.connect(bob), b32("1"), LOCK, bobval)
        })

        it("name in hash", async () => {
            const val0 = '0x' + '11'.repeat(32)
            const val1 = '0x' + 'ff'.repeat(32)
            await send(lib.set, dmap, b32("1"), LOCK, val0)
            await send(lib.set, dmap, b32("2"), LOCK, val1)
            await check_entry(dmap, ALI, b32('1'), LOCK, val0)
            await check_entry(dmap, ALI, b32('2'), LOCK, val1)
        })

        it('name all bits in hash', async () => {
            const addr = ethers.ZeroAddress
            await hh.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [addr]
            })
            await hh.network.provider.send("hardhat_setBalance", [addr, "0xDE0B6B3A7640000"])
            const fakeSigner = await ethers.getSigner(addr)
            want(fakeSigner.address).to.eql(addr)
            const names = [
                ethers.ZeroHash,
                '0x80' + '00'.repeat(31),
                '0x' + '00'.repeat(31) + '01',
                '0x' + 'ff'.repeat(32),
                '0x' + 'ff'.repeat(31) + 'fe', // flip lsb
                '0x7f' + 'ff'.repeat(31), // flip msb
            ]
            for (let i = 0; i < names.length; i++) {
                await send(lib.set, dmap.connect(fakeSigner), names[i], LOCK, b32(String(i)))
            }
            for (let i = 0; i < names.length; i++) {
                await check_entry(dmap, fakeSigner.address, names[i], LOCK, b32(String(i)))
            }
            await hh.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [addr]
            })
        })

        it('zone all bits in hash', async () => {
            const addrs = [
                ethers.ZeroAddress,
                '0x80' + '00'.repeat(19),
                '0x' + '00'.repeat(19) + '0f',
                '0x' + 'ff'.repeat(20),
                '0x' + 'ff'.repeat(19) + 'fe', // flip lsb
                '0x7f' + 'ff'.repeat(19), // flip msb
            ]
            const name = b32('1')
            for (let i = 0; i < addrs.length; i++) {
                const addr = ethers.getAddress(addrs[i])
                await hh.network.provider.request({
                    method: "hardhat_impersonateAccount",
                    params: [addr]
                })
                await hh.network.provider.send("hardhat_setBalance", [addr, "0xDE0B6B3A7640000"])
                const fakeSigner = await ethers.getSigner(addr)
                await send(lib.set, dmap.connect(fakeSigner), name, LOCK, b32(String(i)))
                await hh.network.provider.request({
                    method: "hardhat_stopImpersonatingAccount",
                    params: [addr]
                })
            }
            for (let i = 0; i < addrs.length; i++) {
                await check_entry(dmap, ethers.getAddress(addrs[i]), name, LOCK, b32(String(i)))
            }
        })
    })

    describe('slot and get', () => {
        it('root get', async () => {
            const [rootMeta, rootData] = await testlib.get(dmap, '0x' + '00'.repeat(32))
            want(ethers.dataSlice(rootData, 0, 20))
                .to.eql((await rootzone.getAddress()).toLowerCase())
            want(rootMeta).to.eql(LOCK)
        })

        it('root slot', async () => {
            const rootMeta = await lib.slot(dmap, '0x' + '00'.repeat(32))
            want(rootMeta).to.eql(LOCK)

            const rootData = await lib.slot(dmap, '0x' + '00'.repeat(31) + '01')
            want(ethers.dataSlice(rootData, 0, 20))
                .to.eql((await rootzone.getAddress()).toLowerCase())
        })

        it('direct traverse', async ()=>{
            const coder = ethers.AbiCoder.defaultAbiCoder()
            const root_free_slot = ethers.keccak256(coder.encode(["address", "bytes32"], [await rootzone.getAddress(), b32('free')]))
            const [root_free_meta, root_free_data] = await testlib.get(dmap, root_free_slot)
            want(root_free_data).eq(padRight(await freezone.getAddress()))
            const flags = Buffer.from(root_free_meta.slice(2), 'hex')[31]
            want(flags & lib.FLAG_LOCK).to.equal(lib.FLAG_LOCK)
        })
    })

    describe('lock', () => {
        const check_ext_unchanged = async () => {
            const zero = ethers.ZeroHash
            await check_entry(dmap, BOB, b32("1"), zero, zero)
            await check_entry(dmap, ALI, b32("2"), zero, zero)
        }

        it('set without data', async () => {
            await send(lib.set, dmap, b32("1"), LOCK, ethers.ZeroHash)
            await check_entry(dmap, ALI, b32("1"), LOCK, ethers.ZeroHash)

            await fail('LOCK', lib.set, dmap, b32("1"), ethers.ZeroHash, ethers.ZeroHash)
            await fail('LOCK', lib.set, dmap, b32("1"), LOCK, ethers.ZeroHash)
            await fail('LOCK', lib.set, dmap, b32("1"), ethers.ZeroHash, b32('hello'))
            await fail('LOCK', lib.set, dmap, b32("1"), LOCK, b32('hello'))
            await check_ext_unchanged()
        })

        it('set with data', async () => {
            await send(lib.set, dmap, b32("1"), LOCK, b32('hello'))
            await check_entry(dmap, ALI, b32("1"), LOCK, b32('hello'))
            await fail('LOCK', lib.set, dmap, b32("1"), LOCK, b32('hello'))
            await check_ext_unchanged()
        })

        it("set a few times, then lock", async () => {
            await send(lib.set, dmap, b32("1"), ethers.ZeroHash, ethers.ZeroHash)
            await check_entry(dmap, ALI, b32("1"), ethers.ZeroHash, ethers.ZeroHash)

            await send(lib.set, dmap, b32("1"), ethers.ZeroHash, b32('hello'))
            await check_entry(dmap, ALI, b32("1"), ethers.ZeroHash, b32('hello'))

            await send(lib.set, dmap, b32("1"), ethers.ZeroHash, b32('goodbye'))
            await check_entry(dmap, ALI, b32("1"), ethers.ZeroHash, b32('goodbye'))

            await send(lib.set, dmap, b32("1"), LOCK, b32('goodbye'))
            await check_entry(dmap, ALI, b32("1"), LOCK, b32('goodbye'))

            await fail('LOCK', lib.set, dmap, b32("1"), ethers.ZeroHash, ethers.ZeroHash)
            await check_ext_unchanged()
        })

        it("0xffff...e doesn't lock, 0xffff...f locks", async () => {
            const FLIP_LOCK = '0x'+'f'.repeat(63)+'e'
            await send(lib.set, dmap, b32("1"), FLIP_LOCK, ethers.ZeroHash)

            const neg_one = '0x'+'ff'.repeat(32)
            await send(lib.set, dmap, b32("1"), neg_one, ethers.ZeroHash)
            await fail('LOCK', lib.set, dmap, b32("1"), ethers.ZeroHash, ethers.ZeroHash)
            await check_ext_unchanged()
        })
    })

    describe('DmapFace', () => {
        it('error LOCKED', async () => {
            const errfrag = dmap_i.getError("LOCKED")
            want(errfrag.inputs.length).to.eql(0)
            want(errfrag.name).to.eql("LOCKED")
        })

        it('event Set', async () => {
            const eventfrag = dmap_i.getEvent("Set")
            want(eventfrag.inputs.length).to.eql(4)
            want(eventfrag.name).to.eql("Set")

            const dmapAddr = await dmap.getAddress()
            const dmap_with_abi = new ethers.Contract(dmapAddr, dmapi_abi, ali)
            const name = '0x'+'88'.repeat(32)
            const meta = '0x'+'cc'.repeat(32)
            const data = '0x'+'ee'.repeat(32)
            await send(dmap_with_abi.set, name, meta, data)
            await expectLog(dmap_with_abi, "Set", ALI, name, meta, data, true)
        })

        describe('calldata', () => {
            const name = b32('MyKey')
            const pairabi = ["function pair(address zone, bytes32 name) external view returns (bytes32, bytes32)"]
            const pair_i = new ethers.Interface(pairabi)
            it('pair', async () => {
                const dmapAddr = await dmap.getAddress()
                const calldata = pair_i.encodeFunctionData("pair", [ALI, name])
                await want(ali.sendTransaction(
                    {to: dmapAddr, data: calldata.slice(0, calldata.length)}
                )).rejectedWith('')
                await want(ali.sendTransaction(
                    {to: dmapAddr, data: calldata + '00'}
                )).rejectedWith('')
                await want(ali.sendTransaction({to: dmapAddr, data: calldata}))
                    .rejectedWith('')
            })

            it('set', async () => {
                const dmapAddr = await dmap.getAddress()
                const calldata = dmap_i.encodeFunctionData("set", [name, name, name])
                await want(ali.sendTransaction(
                    {to: dmapAddr, data: calldata.slice(0, calldata.length - 2)}
                )).rejectedWith('')
                await want(ali.sendTransaction(
                    {to: dmapAddr, data: calldata + '00'}
                )).rejectedWith('')
                await ali.sendTransaction({to: dmapAddr, data: calldata})
            })

            const slotabi = ["function slot(bytes32 s) external view returns (bytes32)"]
            const slot_i = new ethers.Interface(slotabi)
            it('slot', async () => {
                const dmapAddr = await dmap.getAddress()
                const calldata = slot_i.encodeFunctionData("slot", [name])
                await ali.sendTransaction({to: dmapAddr, data: calldata})
            })

            it('get', async () => {
                const dmapAddr = await dmap.getAddress()
                const calldata = dmap_i.encodeFunctionData("get", [name])
                await want(ali.sendTransaction(
                    {to: dmapAddr, data: calldata.slice(0, calldata.length - 2)}
                )).rejectedWith('')
                await ali.sendTransaction({to: dmapAddr, data: calldata.slice(0, calldata.length)})
            })
        })
    })

    describe('gas', () => {
        const name = b32('MyKey')
        const one  = Buffer.from('10'.repeat(32), 'hex') // lock == 0
        const two  = Buffer.from('20'.repeat(32), 'hex')
        describe('set', () => {

            describe('no change', () => {
                it('0->0', async () => {
                    const rx = await send(lib.set, dmap, name, ethers.ZeroHash, ethers.ZeroHash)
                    const bound = bounds.dmap.set[0][0]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->1', async () => {
                    await send(lib.set, dmap, name, one, one)
                    const rx = await send(lib.set, dmap, name, one, one)
                    const bound = bounds.dmap.set[1][1]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
            })
            describe('change', () => {
                it('0->1', async () => {
                    const rx = await send(lib.set, dmap, name, one, one)
                    const bound = bounds.dmap.set[0][1]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->0', async () => {
                    await send(lib.set, dmap, name, one, one)
                    const rx = await send(lib.set, dmap, name, ethers.ZeroHash, ethers.ZeroHash)
                    const bound = bounds.dmap.set[1][0]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
                it('1->2', async () => {
                    await send(lib.set, dmap, name, one, one)
                    const rx = await send(lib.set, dmap, name, two, two)
                    const bound = bounds.dmap.set[1][2]
                    await check_gas(rx.gasUsed, bound[0], bound[1])
                })
            })
        })

        it('get', async () => {
            const coder = ethers.AbiCoder.defaultAbiCoder()
            await send(lib.set, dmap, name, one, one)
            const slot = ethers.keccak256(coder.encode(["address", "bytes32"], [ALI, name]))
            const calldata = dmap_i.encodeFunctionData("get", [slot])
            const dmapAddr = await dmap.getAddress()
            const signer = dmap.runner
            const tx = await signer.sendTransaction({to: dmapAddr, data: calldata})
            const rx = await tx.wait()

            const bound = bounds.dmap.get
            await check_gas(rx.gasUsed, bound[0], bound[1])
        })
   })

})
