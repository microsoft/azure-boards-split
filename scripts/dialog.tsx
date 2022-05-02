/// <reference types="vss-web-extension-sdk" />

import { ITheme, getTheme, ITextFieldProps, TextField, ICheckboxProps, Checkbox, FocusZone, FocusZoneDirection, ThemeProvider } from '@fluentui/react';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { List } from '@fluentui/react/lib/List';
import * as React from 'react';
import * as ReactDOM from 'react-dom'


import { WorkItem, WorkItemExpand } from "TFS/WorkItemTracking/Contracts";
import { getClient } from "TFS/WorkItemTracking/RestClient";

import { CoreFields } from "./constants";


// Initialize icons in case this example uses them
initializeIcons();


const DefaultExcludedWorkItemStates = ["Closed", "Removed", "Cut", "Done", "Completed"];
const ExcludedWorkItemMetaStates = ["Completed", "Removed"];

enum LoadingState {
    Loading,
    Loaded
}

const theme: ITheme = getTheme();
const { palette, semanticColors, fonts } = theme;


function getChildIds(workItem: WorkItem): number[] {
    return !workItem.relations ? [] : workItem.relations.filter(relation => relation.rel === "System.LinkTypes.Hierarchy-Forward").map(relation => {
        var url = relation.url;
        return parseInt(url.substr(url.lastIndexOf("/") + 1), 10);
    });
}

class TextFieldComponenet extends React.Component<ITextFieldProps, any> {
    public render(): JSX.Element {
        var onChange = (event: any) => {
            this.props.onChange(event.target.value);
        }
        return <fieldset>
            <TextField label='Title' id='name' value={this.props.value} onChange={onChange} />
        </fieldset>
    }
}


class CheckboxComponent extends React.Component<ICheckboxProps, any> {

    public render(): JSX.Element {
        var onChange = (event: any) => {
            this.props.onChange(event.target.checked);
        }
        return <Checkbox id='open' label="Open newly created work item" checked={this.props.checked} onChange={onChange} />
        
    }
}


class TagCheckboxComponent extends React.Component<ICheckboxProps, any> {

    public render(): JSX.Element {
        var onChange = (event: any) => {
            this.props.onChange(event.target.checked);
        }

        return <Checkbox id='tags' label="Copy tags to new work item" checked={this.props.checked} onChange={onChange} />
        
    }
}

interface IListComponentProps {
    items: { key: string | number, title: string }[];
    onRemove: (key: string | number) => void;
}

class ListComponent extends React.Component<IListComponentProps> {

    constructor(props: any) {
        super(props);
    }

    public render(): any {

        var createItem = (item, index: number | undefined) => {

            var onRemove = () => {
                this.props.onRemove(item.key);
            }

            return <li key={item.key} >
                <div className="item-color"></div>
                <div className="item-text">{item.title}</div>
                <div className="item-action" onClick={onRemove}></div>
            </li>
        }

        return <ul className="list">
            <List items={this.props.items} onRenderCell={createItem} />
        </ul>
    }
}


interface IDialogComponentState {
    loadState: LoadingState;
    workItem: WorkItem;
    children: WorkItem[];
    selectedIds: number[];
    newTitle: string;
    openNewWorkItem: boolean;
    copyTags: boolean;
}

class DialogComponent extends React.Component<any, IDialogComponentState> {

    constructor(props) {
        super(props);
        this.state = {
            loadState: LoadingState.Loading,
            workItem: null,
            children: [],
            selectedIds: [],
            newTitle: "",
            openNewWorkItem: false,
            copyTags: false
        };


    }



    public render() {
        if (this.state.loadState === LoadingState.Loaded) {
            let { workItem, children, selectedIds, newTitle, openNewWorkItem, copyTags } = this.state;
            if (!children || children.length === 0) {
                return <div>
                    <div>There are no children to be split from this work item.</div>
                    <div className="no-children"></div>
                </div>;
            }
            else {
                let description = ["Below are the incomplete items for ", <strong key={workItem.id}>{workItem.fields[CoreFields.WorkItemType]}: {workItem.id}</strong>, ".  Split to continue them in your next sprint."];
                let items = children.filter(workitem => selectedIds.indexOf(workitem.id) !== -1).map(child => {
                    return {
                        key: child.id,
                        title: `${child.id}: ${child.fields[CoreFields.Title]}`
                    }
                });

                var onTextboxChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { newTitle: value }));
                };

                var onCheckboxChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { openNewWorkItem: value }));
                };

                var onCopyTagsChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { copyTags: value }));
                };

                var onRemove = (key: string | number) => {
                    this.setState(Object["assign"]({}, this.state, { selectedIds: selectedIds.filter(i => i !== key) }));
                };

                var onChecboxClick = (value) => {
                    console.log(value, "I was clicked");
                }

                return <div>
                    <div>{description}</div>
                    <TextFieldComponenet value={newTitle} onChange={onTextboxChange} />
                    <ListComponent items={items} onRemove={onRemove} />
                    <CheckboxComponent checked={openNewWorkItem} onChange={onCheckboxChange} /><br />
                    <TagCheckboxComponent checked={copyTags} onChange={onCopyTagsChange} />
                 </div>;
            }
        }
        return null;
    }


    public async startSplit(id: number): Promise<boolean> {
        var client = getClient();
        const context = VSS.getWebContext();

        const workItem = await client.getWorkItem(id, null, null, WorkItemExpand.All)
        var childIds = getChildIds(workItem);

        // Display "No children to be split"
        if (childIds.length === 0) {
            this.setState({
                loadState: LoadingState.Loaded,
                workItem: null,
                children: [],
                selectedIds: [],
                newTitle: "",
                openNewWorkItem: false,
                copyTags: false
            });
            return false;
        }
        else {
            var workItemTypeToExcludedStates = {};
            var incompleteChildren = [];

            const children = await client.getWorkItems(childIds)

            for (var i = 0, len = children.length; i < len; i++) {
                const childItem = children[i];
                const childItemType = childItem.fields[CoreFields.WorkItemType];

                // We need to determine this child's specific "Completed" and "Removed" states (may be custom depending on process)
                // For example, "Closed" state is from the "Completed" category. Some users may have a custom process with additional 
                // states in "Completed" or "Removed". After fetching, store each type's states in a dictionary 
                if (!workItemTypeToExcludedStates[childItemType]) {
                    const states = await client.getWorkItemTypeStates(context.project.name, childItem.fields[CoreFields.WorkItemType]);
                    const stateNamesInExcludedCategory = [];
                    states.forEach(s => {
                        if (s.category === ExcludedWorkItemMetaStates[0] || s.category === ExcludedWorkItemMetaStates[1]) {
                            stateNamesInExcludedCategory.push(s.name);
                        }
                    })

                    workItemTypeToExcludedStates[childItemType] = stateNamesInExcludedCategory;
                }

                // Check if this child work item is in an incomplete state ("Proposed", "In Progress", or "Resolved")
                const excludedStates = workItemTypeToExcludedStates[childItemType] || DefaultExcludedWorkItemStates;
                const childState = children[i].fields[CoreFields.State];
                if (excludedStates.indexOf(childState) === -1) {
                    incompleteChildren.push(children[i]);
                }
            }

            this.setState({
                workItem: workItem,
                children: incompleteChildren,
                loadState: LoadingState.Loaded,
                selectedIds: incompleteChildren.map(c => c.id),
                newTitle: workItem.fields[CoreFields.Title],
                openNewWorkItem: true,
                copyTags: true
            });

            return this.state.selectedIds.length > 0;
        }
    }
}

let element = document.getElementById("main");
let dialogComponent: DialogComponent;

ReactDOM.render(<ThemeProvider><DialogComponent ref={(i) => dialogComponent = i} /></ThemeProvider>, element);

var dialog = {
    startSplit: (id: number) => dialogComponent.startSplit(id),
    getDetails: (): { ids: number[], title: string, shouldOpenNewWorkItem: boolean, shouldCopyTags: boolean } => {
        return {
            ids: dialogComponent.state.selectedIds,
            title: dialogComponent.state.newTitle,
            shouldOpenNewWorkItem: dialogComponent.state.openNewWorkItem,
            shouldCopyTags: dialogComponent.state.copyTags
        };
    }
};
VSS.register(VSS.getContribution().id, dialog);
VSS.notifyLoadSucceeded();