# Split! 

Split! enables teams to easily continue unfinished work items into the next sprint by “splitting” the work item into a new card in the next sprint.

### What's special about Split?
Smart detects incomplete tasks - even for processes with custom states
Defaults split work item to the next iteration
Maintains parent link
Retains all attachments
Copies description, repro steps, acceptance criteria and any required fields to new work item
Inserts comment revision with links detailing the split operation
Optionally copies all tags

# Documentation

For detailed instructions on using the Split Azure DevOps extension, please refer to the official documentation. You can access the comprehensive guide by clicking [Market place](https://marketplace.visualstudio.com/items?itemName=blueprint.vsts-extension-split-work). This resource provides step-by-step information to help you effectively utilize the estimation features within your Azure DevOps environment.

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
* ```npm build:dev ``` - Just compiling the extension
* ```npm run dev ``` - Compile TS files and move necessery files to dist folder. Start webpack-dev-server that will host the files from you localmachine from https://localhost:9090

For production:
 ``` npm run build:release ``` - Compile TS files using production configuration and move necessery files to dist folder
 ``` npm run package:release ``` - Create a zip file with all the files in dist folder.

#### Setup for custom extensions ####

1. Run npm install 
2. Change the publisher and version if needed in the azure-devops-extension.json
3. npm run build:release
4. npm run package:release
5. Upload to your on-prem instance via the marketplace

#### VS Code ####

The included `.vscode` config allows you to open and build the project using [VS Code](https://code.visualstudio.com/).


# Support

## How to file issues and get help

This project uses [GitHub Issues](https://github.com/microsoft/azure-boards-split/issues) to track bugs and feature requests. Please search the existing issues before filing new issues to avoid duplicates. For new issues, file your bug or feature request as a new Issue. 

## Microsoft Support Policy
Support for this project is limited to the resources listed above.



## Contributing

We welcome contributions to improve the the Split  Azure DevOps extension. If you would like to contribute, please fork the repository and create a pull request with your changes. Your contributions help enhance the functionality and usability of the extension for the entire community.

## Microsoft DevLabs
Microsoft DevLabs is an outlet for experiments from Microsoft, experiments that represent some of the latest ideas around developer tools. Solutions in this category are designed for broad usage, and you are encouraged to use and provide feedback on them; however, these extensions are not supported nor are any commitments made as to their longevity.