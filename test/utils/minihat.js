// minihat replacement for ethers v6
// The original minihat depends on ethers v5 internally.
// This provides the same API using ethers v6 conventions.

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const want = chai.expect

function b32(str) {
    const buf = Buffer.alloc(32)
    buf.write(str)
    return buf
}

async function send(fn, ...args) {
    const tx = await fn(...args)
    if (tx && tx.wait) {
        return await tx.wait()
    }
    return tx
}

async function fail(errMsg, fn, ...args) {
    try {
        const result = await fn(...args)
        // If we got a tx response, try waiting (but with error handling)
        if (result && result.wait) {
            try {
                await result.wait()
            } catch (waitErr) {
                const wmsg = (waitErr.shortMessage || waitErr.message || '')
                if (wmsg.includes(errMsg)) return
                if (waitErr.reason && waitErr.reason.includes(errMsg)) return
                throw new Error(`Expected "${errMsg}" but got: ${wmsg}`)
            }
        }
        throw new Error('Expected failure but tx succeeded')
    } catch (e) {
        if (e.message === 'Expected failure but tx succeeded') throw e
        const msg = (e.shortMessage || e.message || e.toString())
        if (msg.includes(errMsg)) return
        if (e.reason && e.reason.includes(errMsg)) return
        if (e.info && e.info.error && e.info.error.message && e.info.error.message.includes(errMsg)) return
        // For custom errors, the error data contains the selector
        if (e.data && msg.includes('reverted')) {
            // Try to match custom error name in the full error chain
            const fullMsg = JSON.stringify(e, Object.getOwnPropertyNames(e))
            if (fullMsg.includes(errMsg)) return
        }
        throw new Error(`Expected error containing "${errMsg}" but got: ${msg}`)
    }
}

function hear(rx, eventName, expectedArgs) {
    // ethers v6 ContractTransactionReceipt has .logs with EventLog objects
    const event = rx.logs.find(log => {
        if (log.fragment && log.fragment.name === eventName) return true
        if (log.eventName === eventName) return true
        return false
    })
    want(event, `Event "${eventName}" not found in receipt`).to.exist
    for (let i = 0; i < expectedArgs.length; i++) {
        const actual = event.args[i]
        const expected = expectedArgs[i]
        if (typeof actual === 'bigint' || typeof expected === 'bigint') {
            want(BigInt(actual)).to.eql(BigInt(expected))
        } else if (typeof actual === 'string' && typeof expected === 'string') {
            want(actual.toLowerCase()).to.eql(expected.toLowerCase())
        } else {
            want(actual).to.eql(expected)
        }
    }
}

let _snapshotId
async function snapshot(hh) {
    _snapshotId = await hh.network.provider.send('evm_snapshot')
}

async function revert(hh) {
    await hh.network.provider.send('evm_revert', [_snapshotId])
    _snapshotId = await hh.network.provider.send('evm_snapshot')
}

async function mine(hh) {
    await hh.network.provider.send('evm_mine')
}

async function wait(hh, seconds) {
    await hh.network.provider.send('evm_increaseTime', [seconds])
    await hh.network.provider.send('evm_mine')
}

module.exports = { send, want, b32, fail, hear, snapshot, revert, mine, wait }
