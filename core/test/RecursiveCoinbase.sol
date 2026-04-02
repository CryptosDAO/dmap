/// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.34;

import "../root.sol";

contract RecursiveCoinbase {
    bool lock = false;
    fallback () external payable {
        if( !lock ) {
            lock = true;
            RootZone rz = RootZone(msg.sender);
            rz.hark{value:1 ether}(0);
            lock = false;
        }
    }
}
