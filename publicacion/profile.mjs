import { createProfile, checkoutProfile, listProfiles, deleteProfile, initDefault } from './profileManager.mjs';

const cmd = process.argv[2];
const name = process.argv[3];

switch (cmd) {
  case 'create':
    await createProfile(name);
    break;
  case 'checkout':
    await checkoutProfile(name);
    break;
  case 'list':
    listProfiles();
    break;
  case 'delete':
    deleteProfile(name);
    break;
  case 'init':
    await initDefault();
    break;
  default:
    console.log('Comandos: create <name>, checkout <name>, list, delete <name>, init');
    break;
}
