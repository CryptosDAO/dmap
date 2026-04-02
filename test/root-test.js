const hh = require('hardhat')
const ethers = hh.ethers
const { b32, fail, hear, revert, send, snapshot, wait, want } = require('./utils/minihat')

const {padRight, check_gas, check_entry} = require('./utils/helpers')
const {bounds} = require("./bounds")
const debug = require('debug')('dmap:test')

describe('rootzone', ()=>{
    let dpack
    let dmap
    let rootzone
    let freezone

    let ali, bob, cat
    let ALI, BOB, CAT

    const zone1 = '0x' + '0'.repeat(38) + '11'
    const zone2 = '0x' + '0'.repeat(38) + '12'

    const delay_period = 60 * 60 * 31
    const LOCK = `0x${'00'.repeat(31)}01`

    function getCommitment (name, zone, salt=b32('salt')) {
        const coder = ethers.AbiCoder.defaultAbiCoder()
        const types = [ "bytes32", "bytes32", "address" ]
        const encoded = coder.encode(types, [ salt, name, zone ])
        return ethers.keccak256(encoded)
    }

    before(async ()=>{
        dpack = await import('@cryptosdao/dpack');
        [ali, bob, cat] = await ethers.getSigners();
        [ALI, BOB, CAT] = [ali, bob, cat].map(x => x.address)

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

    it('init', async () => {
        const mark = getCommitment(b32('free'), await freezone.getAddress())
        const filters = [
            rootzone.filters.Hark(mark),
            rootzone.filters.Etch('0x' + b32('free').toString('hex'), await freezone.getAddress()),
        ]
        for (const f of filters) {
            const res = await rootzone.queryFilter(f)
            want(res.length).to.eql(1)
            debug(res[0].eventName, res[0].args)
        }
        want(await rootzone.dmap()).to.eql(await dmap.getAddress())
        want(Number(await rootzone.last())).to.be.greaterThan(0)
        want(await rootzone.mark()).to.eql(mark)
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), ethers.ZeroHash, ethers.ZeroHash)
        await check_entry(dmap, await rootzone.getAddress(), b32('zone2'), ethers.ZeroHash, ethers.ZeroHash)
    })

    it('cooldown', async ()=>{
        const commitment = getCommitment(b32('zone1'), zone1)
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.parseEther('1') })
        await wait(hh, 60 * 60 * 30)
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.parseEther('1') })
        await wait(hh, 60 * 60)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), ethers.ZeroHash, ethers.ZeroHash)
    })

    it('fee', async ()=>{
        await wait(hh, delay_period)
        const aliStartBalance = await ethers.provider.getBalance(ali.address)
        const commitment = getCommitment(b32('zone1'), zone1)
        await fail('ErrPayment', rootzone.hark, commitment)
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.parseEther('0.9') })
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.parseEther('1.1') })
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        const aliEndBalance = await ethers.provider.getBalance(ali.address)
        want((aliStartBalance - ethers.parseEther('1.0')) > aliEndBalance).to.be.true
        want((aliStartBalance - ethers.parseEther('1.5')) < aliEndBalance).to.be.true
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), ethers.ZeroHash, ethers.ZeroHash)
    })

    it('etch fail wrong hash', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        await fail('ErrExpired', rootzone.etch, b32('wrong_salt'), b32('zone1'), zone1)
        await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), LOCK, padRight(zone1))
    })

    it('error priority', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })

        // pending, payment, receipt
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.parseEther('0.9') })
        // payment, receipt
        await wait(hh, delay_period)
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.parseEther('0.9') })

        // receipt
        await hh.network.provider.send(
            "hardhat_setCoinbase", [await rootzone.getAddress()] // not payable
        )
        await fail('ErrReceipt', rootzone.hark, commitment, { value: ethers.parseEther('1') })
    })

    it('etch fail rewrite zone', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('free'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        await fail('LOCK', rootzone.etch, b32('salt'), b32('free'), zone1)
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), ethers.ZeroHash, ethers.ZeroHash)
    })

    it('state updates', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })

        await wait(hh, delay_period)
        const newCommitment = getCommitment(b32('zone2'), zone2)
        await send(rootzone.hark, newCommitment, { value: ethers.parseEther('1') })

        await fail('ErrExpired', rootzone.etch, b32('salt'), b32('zone1'), zone1)
        await send(rootzone.etch, b32('salt'), b32('zone2'), zone2)

        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), ethers.ZeroHash, ethers.ZeroHash)
        await check_entry(dmap, await rootzone.getAddress(), b32('zone2'), LOCK, padRight(zone2))
    })

    it('Hark event', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        const rx = await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        hear(rx, "Hark", [commitment])
    })

    it('Etch event', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
        const rx = await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
        hear(rx, "Etch", ['0x' + b32('zone1').toString('hex'), zone1])
        await check_entry(dmap, await rootzone.getAddress(), b32('zone1'), LOCK, padRight(zone1))
    })

    it('coinbase recursive callback', async () => {
        const mc_type = await ethers.getContractFactory('RecursiveCoinbase', ali)
        const mc = await mc_type.deploy()
        await mc.waitForDeployment()
        await hh.network.provider.send(
            "hardhat_setCoinbase", [await mc.getAddress()]
        )

        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, {value: ethers.parseEther('1')})
        want(await rootzone.mark()).to.eql(commitment)
    })

    describe('gas', () => {
        const commitment = getCommitment(b32('zone1'), zone1)
        it('hark', async () => {
            await wait(hh, delay_period)
            const rx = await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
            const bound = bounds.rootzone.hark
            await check_gas(rx.gasUsed, bound[0], bound[1])
        })

        it('etch', async () => {
            await wait(hh, delay_period)
            await send(rootzone.hark, commitment, { value: ethers.parseEther('1') })
            const rx = await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
            const bound = bounds.rootzone.etch
            await check_gas(rx.gasUsed, bound[0], bound[1])
        })
    })
})
