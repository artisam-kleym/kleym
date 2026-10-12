import {describe,it,expect} from 'vitest'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateLinkKeys} from '../../../packages/sdk/src/keys'
import {writeSecretsCsv} from '../../../packages/sdk/src/csv'
describe('private SDK CSV creation',()=>{
 it('preserves Unicode labels and refuses overwrite without changing the export',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kleym-private-export-'))
  try{const path=join(dir,'prizes é.csv'),keys=generateLinkKeys(1,['Prize 🏆'])
   await writeSecretsCsv(path,keys,'https://kleym.example');const before=await readFile(path,'utf8');expect(before.includes('Prize 🏆')).toBe(true)
   await expect(writeSecretsCsv(path,keys,'https://other.example')).rejects.toThrow();expect((await readFile(path,'utf8'))===before).toBe(true)
  }finally{await rm(dir,{recursive:true,force:true})}
 })
 it('does not overwrite an unrelated existing file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kleym-existing-export-'))
  try{const path=join(dir,'existing.csv');await writeFile(path,'existing nonsecret file');await expect(writeSecretsCsv(path,generateLinkKeys(1),'https://kleym.example')).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('existing nonsecret file')}
  finally{await rm(dir,{recursive:true,force:true})}
 })
})
