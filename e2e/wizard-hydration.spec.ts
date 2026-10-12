import {test,expect} from '@playwright/test'

for(const width of [393,1440]){
 test(`waits for the campaign editor before accepting text at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:851})
  let release!:()=>void
  const scriptsReady=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/_next/static/**/*.js',async route=>{await scriptsReady;await route.continue()})
  try{
   await page.goto('/campaigns/new',{waitUntil:'commit'})
   const name=page.getByLabel('Campaign name')
   await expect(name).toBeVisible()
   await expect(name).toBeDisabled()
   await expect(page.getByTestId('wizard-interactive')).toHaveAttribute('aria-busy','true')
   release()
   await expect(name).toBeEnabled()
   await name.fill('Hydration-safe campaign')
   await page.getByLabel('Amount per link',{exact:true}).fill('2')
   await expect(name).toHaveValue('Hydration-safe campaign')
   await expect(page.getByTestId('wizard-interactive')).toHaveAttribute('aria-busy','false')
  }finally{release()}
 })
}
