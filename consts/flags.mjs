
const env_multi = 'multi'
const env_slingle = 'single'

export const flags = [
  { name: "randomize", default: true, required_argument: false , exe_envs : [env_multi, env_slingle]},
  { name: "batch-limit", default: 10, required_argument: true , exe_envs : [env_multi] },
  { name: "depurator", default: '', required_argument: true , exe_envs : [env_multi, env_slingle] },
  { name: "group-limit", default: 100, required_argument: true  , exe_envs : [env_slingle]},
];
