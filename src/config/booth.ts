// The booth: who may host. With the gate on (the deployed build), a device hosts only once it has
// opened the app with the booth's secret (`/?host=<HOST_SECRET>`), which it keeps; anyone else at
// the app's root sees the demo-mode page. The server checks the same secret (`HOST_SECRET`).

/** EXPO_PUBLIC_HOST_GATE=1 in the booth build; off in development, where the server has no secret. */
export const HOST_GATE = process.env.EXPO_PUBLIC_HOST_GATE === '1';

/** The query parameter a booth device opens the app with once. */
export const HOST_PARAM = 'host';

/** Where the device keeps the secret. */
export const HOST_PASS_KEY = 'vorp.host.v1';

/** The code, linked from the demo-mode page. */
export const REPO_URL = 'https://github.com/xuckless/vorp';
