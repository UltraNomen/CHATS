// Values baked in at build time (vite.config.js `define`); neutral defaults when the sources run under node in tests.
/* global __CHATS_VERSION__, __CHATS_SERVER__ */
export const VERSION = 'v' + (typeof __CHATS_VERSION__ !== 'undefined' ? __CHATS_VERSION__ : '0.0.0-dev');
/** Set for branded client builds (CHATS_SERVER=chat.example.org): the client only ever talks to this server. */
export const LOCKED_SERVER = typeof __CHATS_SERVER__ !== 'undefined' ? __CHATS_SERVER__ : '';
