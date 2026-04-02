/// SPDX-License-Identifier: AGPL-3.0

// free as in free-for-all

/// @title  FreeZone — a free-for-all dmap registry
/// @author Nikolai Mushegian <mail@nikolai.fyi>
/// @notice Anyone may claim an unclaimed key (one claim per block).
///         Controllers can set values in dmap and transfer control.

pragma solidity ^0.8.34;

import { Dmap } from './dmap.sol';

contract FreeZone {
    Dmap                      public immutable dmap;
    uint256                   public           last;
    mapping(bytes32=>address) public           controllers;

    event Give(address indexed giver, bytes32 indexed zone, address indexed recipient);

    error ERR_TAKEN();
    error ERR_LIMIT();
    error ERR_OWNER();

    constructor(Dmap d) {
        dmap = d;
    }

    function take(bytes32 key) external {
        if (controllers[key] != address(0)) revert ERR_TAKEN();
        if (block.timestamp <= last) revert ERR_LIMIT();
        last = block.timestamp;
        controllers[key] = msg.sender;
        emit Give(address(0), key, msg.sender);
    }

    function give(bytes32 key, address recipient) external {
        if (controllers[key] != msg.sender) revert ERR_OWNER();
        controllers[key] = recipient;
        emit Give(msg.sender, key, recipient);
    }

    function set(bytes32 key, bytes32 meta, bytes32 data) external {
        if (controllers[key] != msg.sender) revert ERR_OWNER();
        dmap.set(key, meta, data);
    }
}
