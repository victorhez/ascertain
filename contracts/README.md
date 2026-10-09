# Mock launches (Foundry)

`MockToken` and `MockPool` reproduce the on-chain shape Ascertain indexes: an ERC-20 whose supply sits in a closed pool, with buys and sells emitting `Swap(address,bool,uint256,uint256)`.

The scenario generator in `src/fixtures` plants the same patterns (clean, concentrated, wash-traded, clustered) off-chain. These contracts are the on-chain vehicle for replaying them on Elysium testnet (chain 99801) with a funded testnet key.

```bash
cd contracts && forge test
```

**Status.** The contracts and the test are written but have not been compiled or deployed from this repository snapshot. The hosted demo uses the simulated fixtures and labels them as such on every page. When Ascend publishes its hook-pool interface, add an adapter in `src/chain` and point the indexer at the real addresses.
