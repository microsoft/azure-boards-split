/// <reference types="vss-web-extension-sdk" />

import * as React from 'react';
import * as ReactDOM from 'react-dom'


import { WorkItem, WorkItemExpand } from "TFS/WorkItemTracking/Contracts";
import { getClient } from "TFS/WorkItemTracking/RestClient";

import { CoreFields } from "./constants";
import { loadIncompleteChildren } from "./splitLogic";

import { TextField, TextFieldWidth } from "azure-devops-ui/TextField";
import { Checkbox } from "azure-devops-ui/Checkbox";
import { List, IListItemDetails, ListItem, ScrollableList } from "azure-devops-ui/List";
import { FormItem } from "azure-devops-ui/FormItem";

import { ArrayItemProvider } from 'azure-devops-ui/Utilities/Provider';
import { ObservableValue } from 'azure-devops-ui/Core/Observable';
import { css } from "azure-devops-ui/Util";
import { Icon, IconSize } from "azure-devops-ui/Icon";

import { Card } from "azure-devops-ui/Card";

import "azure-devops-ui/Core/override.css";
import "./dialog.scss";


enum LoadingState {
    Loading,
    Loaded
}


class TextFieldComponenet extends React.Component<any, any> {
    public render(): JSX.Element {
        const titleValue = new ObservableValue<string>(this.props.value)



        const onChange = (e, newvalue) => {
            this.props.onChange(newvalue);
        }

        return (<FormItem label="Title" >
            <TextField value={titleValue} onChange={(e, newValue) => (this.props.onChange(newValue))} width={TextFieldWidth.auto} />
        </FormItem>);



        // <fieldset>
        //     <TextField label='Title' value={this.props.value} onChange={onChange} />
        // </fieldset>
    }
}


class CheckboxComponent extends React.Component<any, any> {

    public render(): JSX.Element {
        const checkbox = new ObservableValue<boolean>(this.props.checked);

        const onChange = (event, checked) => {
            checkbox.value = checked;
            this.props.onChange(checked);
        }
        return <Checkbox id='open' label="Open newly created work item" checked={checkbox} onChange={onChange} />

    }
}


class TagCheckboxComponent extends React.Component<any, any> {

    public render(): JSX.Element {
        const checkbox = new ObservableValue<boolean>(this.props.checked);

        const onChange = (event, checked) => {
            checkbox.value = checked;
            this.props.onChange(checked);
        }

        return <Checkbox id='tags' label="Copy tags to new work item" checked={checkbox} onChange={onChange} />

    }
}

interface IListComponentProps {
    items: IListWorkItem[];
    onRemove: (key: string | number) => void;
}
interface IListWorkItem {
    key: string | number,
    title: string
}

class ListComponent extends React.Component<IListComponentProps> {

    constructor(props: any) {
        super(props);
    }

    public render(): any {


        const createItem = (
            index: number,
            item: IListWorkItem,
            details: IListItemDetails<IListWorkItem>,
            key?: string) => {

            const onRemove = () => {
                this.props.onRemove(item.key);
            }

            return <ListItem key={key || "list-item" + index} index={index} details={details}>
                <div className="item-color"></div>
                <div className="item-text">{item.title}</div>
                <Icon ariaLabel="close" iconName="ChromeClose" size={IconSize.small} onClick={onRemove} />
             
            </ListItem>
        }

        return <Card className="list-card">
        
        <div className='list'>
            <ScrollableList
                itemProvider={new ArrayItemProvider<IListWorkItem>(this.props.items)}
                renderRow={createItem}
                className=''
                width="100%"
            />
        </div>
        </Card>

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
            const { workItem, children, selectedIds, newTitle, openNewWorkItem, copyTags } = this.state;
            if (!children || children.length === 0) {
                return <div>
                    <div>There are no children to be split from this work item.</div>
                    <div className="no-children"></div>
                </div>;
            }
            else {
                const description = ["Below are the incomplete items for ", <strong key={workItem.id}>{workItem.fields[CoreFields.WorkItemType]}: {workItem.id}</strong>, ".  Split to continue them in your next sprint."];
                const items = children.filter(workitem => selectedIds.indexOf(workitem.id) !== -1).map(child => {
                    return {
                        key: child.id,
                        title: `${child.id}: ${child.fields[CoreFields.Title]}`
                    }
                });

                const onTextboxChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { newTitle: value }));
                };

                const onCheckboxChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { openNewWorkItem: value }));
                };

                const onCopyTagsChange = (value) => {
                    this.setState(Object["assign"]({}, this.state, { copyTags: value }));
                };

                const onRemove = (key: string | number) => {
                    this.setState(Object["assign"]({}, this.state, { selectedIds: selectedIds.filter(i => i !== key) }));
                };



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
        const client = getClient();
        const context = VSS.getWebContext();

        const workItem = await client.getWorkItem(id, null, null, WorkItemExpand.All)
        const incompleteChildren = await loadIncompleteChildren(workItem, context.project.name, {
            getWorkItems: async ids => client.getWorkItems(ids),
            getWorkItemTypeStates: async (project, type) => client.getWorkItemTypeStates(project, type)
        });

        // Display "No children to be split"
        if (incompleteChildren.length === 0) {
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
            this.setState({
                workItem: workItem,
                children: incompleteChildren,
                loadState: LoadingState.Loaded,
                selectedIds: incompleteChildren.map(c => c.id),
                newTitle: workItem.fields[CoreFields.Title],
                openNewWorkItem: true,
                copyTags: true
            });

            return incompleteChildren.length > 0;
        }
    }
}

const element = document.getElementById("root");
let dialogComponent: DialogComponent;

ReactDOM.render(<DialogComponent ref={(i) => dialogComponent = i} />, element);

const dialog = {
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