const fs = require('fs')

const b32 = (str) => {
    const buf = Buffer.alloc(32)
    buf.write(str)
    return buf
}

task('dmap-mock-deploy', async (args, hh)=> {
    const dpack = await import('@cryptosdao/dpack')
    const ethers = hh.ethers
    const packdir = args.packdir ?? './pack/'

    const dmap_type = await hh.artifacts.readArtifact('Dmap')
    const _dmap__type = await hh.artifacts.readArtifact('_dmap_')
    dmap_type.bytecode = _dmap__type.bytecode
    dmap_type.deployedBytecode = _dmap__type.deployedBytecode
    const dmap_deployer = await hh.ethers.getContractFactory('_dmap_')

    const root_type = await hh.artifacts.readArtifact('RootZone')
    const root_deployer = await hh.ethers.getContractFactory('RootZone')

    const free_type = await hh.artifacts.readArtifact('FreeZone')
    const free_deployer = await hh.ethers.getContractFactory('FreeZone')

    const [ali] = await hh.ethers.getSigners()
    const tx_count = await ali.getNonce()
    const root_address = ethers.getCreateAddress({ from: ali.address, nonce: tx_count + 1 })
    const tx_dmap = await dmap_deployer.deploy(root_address)
    await tx_dmap.waitForDeployment()
    const tx_root = await root_deployer.deploy(await tx_dmap.getAddress())
    const tx_free = await free_deployer.deploy(await tx_dmap.getAddress())
    await tx_root.waitForDeployment()
    await tx_free.waitForDeployment()

    const salt = b32('salt')
    const name = b32('free')
    const zone = await tx_free.getAddress()
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const types = [ "bytes32", "bytes32", "address" ]
    const encoded = coder.encode(types, [ salt, name, zone ])
    const commitment = ethers.keccak256(encoded)
    const harkTx = await tx_root.hark(commitment, { value: ethers.parseEther('1') })
    await harkTx.wait()
    const etchTx = await tx_root.etch(salt, name, zone)
    await etchTx.wait()

    const pb = dpack.builder(hh.network.name)
    await pb.packObject({
        objectname: 'dmap',
        typename: 'Dmap',
        address: await tx_dmap.getAddress(),
        artifact: dmap_type
    }, true)

    // save only dmap in the core pack
    const corepack = pb.build()

    // put everything else in a 'full' pack
    await pb.packObject({
        objectname: 'rootzone',
        typename: 'RootZone',
        address: await tx_root.getAddress(),
        artifact: root_type
    }, true)

    await pb.packObject({
        objectname: 'freezone',
        typename: 'FreeZone',
        address: await tx_free.getAddress(),
        artifact: free_type
    }, true)

    const fullpack = pb.build()

    const show =(o)=> JSON.stringify(o, null, 2)

    fs.writeFileSync(packdir + `MockDmap.json`, show(dmap_type))
    fs.writeFileSync(packdir + `RootZone.json`, show(root_type))
    fs.writeFileSync(packdir + `FreeZone.json`, show(free_type))

    fs.writeFileSync(packdir + `dmap_core_${hh.network.name}.dpack.json`, show(corepack))
    fs.writeFileSync(packdir + `dmap_full_${hh.network.name}.dpack.json`, show(fullpack))

    return fullpack
})
