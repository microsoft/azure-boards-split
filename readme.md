## Split! ##

#### Customizing this extension ####

This extension does a best effort to copy relevant information - including Title, AssignedTo, AreaPath, Description and any required fields. You may want additional custom fields to copy on split. We cannot support everyone's custom configuration, so we've tried to make it easy to clone this repo and create your own version of this extension. 

If you think your change would benefit others - please contribute to the master extension! 

### Structure ###

```
/scripts            - Typescript code for extension
/img                - Image assets for extension and description
/css                - Style assets for extension
/typings            - Typescript typings

details.md          - Description to be shown in marketplace   
index.html          - Main entry point
dialog.html         - Dialog html
azure-devops-extension.json  - Extension manifest
```

#### Webpack ####

There are few commands defined using webpack: 

For development:
* `npm build:dev` - Just compiling the extension
* `npm run dev` - Compile TS files and move necessery files to dist folder. Start webpack-dev-server that will host the files from you localmachine from https://localhost:9090

For production:
* `npm run build:release` - Compile TS files using production configuration and move necessery files to dist folder
* `npm run package:release` - Create a zip file with all the files in dist folder.

#### Setup for custom extensions ####

1. Run npm install 
2. Change the publisher and version if needed in the azure-devops-extension.json
3. npm run build:release
4. npm run package:release
5. Upload to your on-prem instance via the marketplace

#### VS Code ####

The included `.vscode` config allows you to open and build the project using [VS Code](https://code.visualstudio.com/).
