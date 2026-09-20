/**
 * Host half: make sure the TokenDashboard data server is running.
 * The UI itself is an iframe served by the loopback HTTP server, so the host
 * half only needs to guarantee that service is up. The server path is derived
 * from this module's own location, so the package works from any install dir.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkgRoot = require.resolve('./package.json').replace(/\/package\.json$/, '')
const SERVER = pkgRoot + '/server.mjs'

export function apply() {
  try {
    if (globalThis.__tokenDashboardServerSpawned === true) return
    globalThis.__tokenDashboardServerSpawned = true
    const child = spawn(process.execPath, [SERVER], { detached: true, stdio: 'ignore' })
    child.on('error', function () {})
    child.unref()
  } catch (err) {
    /* the server may already be running; ignore */
  }
}
