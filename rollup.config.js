import pkgJson from './package.json';
import metablock from 'rollup-plugin-userscript-metablock';

let rollupExports = [];


let userScriptConfig = {
    input: `src/main.js`,
    output: {
        format: 'iife',
        file: `dist/battlestats_script.user.js`,
        sourcemap: false,
    },
    plugins:[
        metablock({
            file: `src/userscript.meta.json`,
            override: {
                author: pkgJson.author,
                version: pkgJson.version,
                description: pkgJson.description,
            }
        })
    ]
}

rollupExports.push(userScriptConfig)

let devFilePath = process.env.DEV_FILEPATH

if (devFilePath !== 'Placeholder') {
    let developerScriptConfig = {
        ...userScriptConfig,
        input: 'src/dev_main.js',
        output: {
            ...userScriptConfig.output,
            file: `dist/dev_battlestats_script.user.js`,
            sourcemap: false,
        },
        plugins:[
            metablock({
                file: `src/userscript.meta.json`,
                override: {
                    author: pkgJson.author,
                    version: pkgJson.version,
                    description: pkgJson.description,
                    require: `file://${devFilePath}/${userScriptConfig.output.file}`,
                }
            })
        ]
    }
    rollupExports.push(developerScriptConfig)
}

export default rollupExports