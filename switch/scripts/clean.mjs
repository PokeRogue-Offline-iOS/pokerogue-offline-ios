import { rm } from "node:fs/promises";

for (const path of ["romfs", "release", "silvershadow-pokerogue-switch-poc.nro"]) {
  await rm(new URL(`../${path}`, import.meta.url), { force: true, recursive: true });
}
