# ascertain-mcp

MCP server for [Ascertain](../README.md): Go / Wait / No-go verdicts and re-fetchable evidence for Ascend launches on Elysium.

```bash
claude mcp add ascertain -e ASCERTAIN_URL=https://<deployment> -- npx -y ascertain-mcp
```

| Tool | Purpose |
| --- | --- |
| `ascertain_check_token` | Fast check before acting: is the holder base and volume organic? |
| `ascertain_readiness` | Per-rule breakdown and what would flip the verdict. |
| `ascertain_verify_finding` | Raw receipts and `cast` commands behind a finding. |

Set `ASCERTAIN_X402_PRIVATE_KEY` to let the server answer `402 Payment Required` automatically with an EIP-3009 USDC authorization. Without it, paid calls return the payment requirements instead.
