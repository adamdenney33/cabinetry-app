// Remotion CLI config — keeps the entry, public dir, and codec choices in
// one place so `npm run render:video` is a one-liner.

import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(20);              // visually lossless-ish; 18-23 typical range
Config.setOverwriteOutput(true);
Config.setEntryPoint('remotion/index.ts');
Config.setPublicDir('remotion/public');
