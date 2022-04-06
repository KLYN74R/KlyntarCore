import {spawn} from 'child_process'

import {PATH_RESOLVE} from '../../../KLY_Utils/utils.js'

const ls2 = spawn('node',[PATH_RESOLVE(`KLY_Plugins/dev/websocket/server.js`)]);


ls2.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

ls2.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

ls2.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
