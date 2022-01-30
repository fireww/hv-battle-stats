# For Developers
If you wish to contribute to this script, you can set up your workspace to ease the development process. 

1. Run `npm install`
2. Run `npm run build -- --environment DEV_FILEPATH:Path/To/Your/Working/Directory`
   
   This will generate two userscripts in the `dist` directory
   1. `battlestats_script.user.js` is the actual userscript.
   2. `dev_battlestats_script.user.js` is a mostly empty userscript that will load the `battlestats_scripts.user.js` file.
3. Add the `dist/dev_battlestats_script.user.js` from your local filesystem.
4. In Extensions -> Tampermonkey, turn the `Allow access to file URLs` option on.
5. Running the above `build` command will automatically update the script running in your browser. 