import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,forbidOnly:true,retries:0,timeout:45000,
 expect:{timeout:10000},reporter:[['list'],['html',{outputFolder:'outputs/playwright-report',open:'never'}]],
 outputDir:'outputs/test-results',use:{baseURL:'http://127.0.0.1:5173',headless:true,browserName:'chromium',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
});
