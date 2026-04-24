import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setBrowserExecutable(null); // use bundled chromium from @remotion/renderer
Config.setEntryPoint('./src/Root.tsx');
Config.setCodec('h264');
