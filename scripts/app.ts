/// <reference types="vss-web-extension-sdk" />

import { WorkItem, WorkItemExpand, WorkItemRelation } from"TFS/WorkItemTracking/Contracts";
import { getClient as getClientWit } from"TFS/WorkItemTracking/RestClient";
import { IWorkItemFormNavigationService, WorkItemFormNavigationService } from"TFS/WorkItemTracking/Services";

import { TeamSettingsIteration } from"TFS/Work/Contracts";
import { getClient as getClientWork } from"TFS/Work/RestClient";

import { CoreFields, AdditionalFields } from "./constants";
import { ignoreCaseComparer } from "VSS/Utils/String";
import { VssConnection } from "VSS/Service";


function createFieldPatchBlock(field: string, value: string): any {
    return {
        "op": "add",
        "path": "/fields/" + field,
        "value": value === undefined ? "" : value
    };
}

function createRemoveRelationPatchBlock(index: string) {
    return {
        "op": "remove",
        "path": "/relations/" + index
    };
}

function createAddRelationPatchBlock(relation: WorkItemRelation) {
    return {
        "op": "add",
        "path": "/relations/-",
        "value": relation
    };
}

function createHtmlLink(link: string, text: number | string) {
    return `<a href="${link}" target="_blank">${text}</a>`;
}

function createWorkItemHtmlLink(id: number): string {
    const context = VSS.getWebContext();
    const link = `${context.collection.uri}${context.project.name}/_workitems/edit/${id}`;
    return createHtmlLink(link, id);
}

function removeLinks(workItem: WorkItem, linkedWorkItemIds: number[], targetId: number): IPromise<WorkItem> {
    if (!linkedWorkItemIds || linkedWorkItemIds.length === 0) {
        return new Promise(function (resolve, reject) {
            resolve(workItem);
        });
    }

    const indices = [];
    workItem.relations.forEach((relation, index) => {
        linkedWorkItemIds.forEach(id => {
            const relationId = parseInt(relation.url.substr(relation.url.lastIndexOf("/") + 1), 10);
            if (relationId === id) {
                indices.unshift(index);
            }
        });
    });

    const patchDocument = indices.map(index => createRemoveRelationPatchBlock(index));

    const childLinks = linkedWorkItemIds.map(id => createWorkItemHtmlLink(id)).join(", ");
    const comment = `The following items were ${createHtmlLink("http://aka.ms/split", "split")} to work item ${createWorkItemHtmlLink(targetId)}:<br>&nbsp;&nbsp;${childLinks}`;
    patchDocument.push(createFieldPatchBlock(CoreFields.History, comment));

    return getClientWit().updateWorkItem(patchDocument, workItem.id);
}

function addRelations(workItem: WorkItem, relations: WorkItemRelation[]): IPromise<WorkItem> {
    if (!relations || relations.length === 0) {
        return new Promise(function (resolve, reject) {
            return workItem;
        });
    }

    const patchDocument = relations.map(relation => createAddRelationPatchBlock(relation));
    return getClientWit().updateWorkItem(patchDocument, workItem.id);
}

function updateLinkRelations(sourceWorkItem: WorkItem, targetWorkItem: WorkItem, childIdsToMove: number[]): IPromise<WorkItem> {
    const parentRelation = sourceWorkItem.relations.filter(relation => relation.rel === "System.LinkTypes.Hierarchy-Reverse");
    const attachmentRelations = sourceWorkItem.relations.filter(relation => relation.rel === "AttachedFile").map(relation => {
        return <WorkItemRelation>{
            rel: relation.rel,
            url: relation.url,
            title: null,
            attributes: {
                name: relation.attributes["name"],
                resourceCreatedDate: relation.attributes["resourceCreatedDate"],
                resourceModifiedDate: relation.attributes["resourceModifiedDate"],
                resourceSize: relation.attributes["resourceSize"]
            }
        };
    });
    const childRelations = sourceWorkItem.relations.filter(relation => {
        if (relation.rel === "System.LinkTypes.Hierarchy-Forward") {
            const url = relation.url;
            const id = parseInt(url.substr(url.lastIndexOf("/") + 1), 10);
            return childIdsToMove.indexOf(id) > -1;
        }
        return false;
    });

    return removeLinks(sourceWorkItem, childIdsToMove, targetWorkItem.id).then(() => {
        const relationsToAdd = parentRelation.concat(childRelations).concat(attachmentRelations);
        return addRelations(targetWorkItem, relationsToAdd);
    });
}

function updateIterationPath(childIdsToMove: number[], iterationPath: string): IPromise<WorkItem[]> {
    const promises: IPromise<WorkItem>[] = [];
    childIdsToMove.forEach(childId => {
        const patchDocument = [createFieldPatchBlock(CoreFields.IterationPath, iterationPath)];
        promises.push(getClientWit().updateWorkItem(patchDocument, childId));
    });

    return Promise.all(promises);
}

function isFieldInArray(fieldToFind: string, fieldsToCopy: string[]): boolean {
    for (let i = 0; i < fieldsToCopy.length; i++) {
        const fieldInArray = fieldsToCopy[i];
        if (ignoreCaseComparer(fieldInArray, fieldToFind) === 0) {
            return true;
        }
    };

    return false;
}

async function createWorkItem(workItem: WorkItem, copyTags: boolean, title?: string, iterationPath?: string): Promise<WorkItem> {
    const context = VSS.getWebContext();
    const patchDocument = [];
    const currentWorkItemType = workItem.fields[CoreFields.WorkItemType];

    /* Hello custom extension author - Add your custom field ref name here!*/
    const fieldsToCopy = [CoreFields.Title, CoreFields.AssignedTo, CoreFields.IterationPath, CoreFields.AreaPath, CoreFields.Description,
        AdditionalFields.AcceptanceCriteria, AdditionalFields.ReproSteps, AdditionalFields.SystemInfo];

    // Copy any fields that are required for this work item 
    const workItemTypeInfo = await getClientWit().getWorkItemType(context.project.name, currentWorkItemType);
    workItemTypeInfo.fields.forEach(f => {
        // Don't include iteration related fields or state, we don't want that copied from the current work item        
        const isIgnoredField = ignoreCaseComparer(f.referenceName, AdditionalFields.IterationId) === 0 || ignoreCaseComparer(f.referenceName, CoreFields.State) === 0;
        const isRequiredField = f.alwaysRequired;
        if (isRequiredField && !isIgnoredField) {
            if (!isFieldInArray(f.referenceName, fieldsToCopy)) {
                fieldsToCopy.push(f.referenceName);
            }
        }
    });

    if (copyTags) {
        fieldsToCopy.push(CoreFields.Tags);
    }

    // Add all fields to the patch document that will be used to create the work item
    fieldsToCopy.forEach(field => {
        if (field === CoreFields.Title && title && title.length > 0) {
            patchDocument.push(createFieldPatchBlock(field, title));
        }
        else if (field === CoreFields.IterationPath && iterationPath) {
            patchDocument.push(createFieldPatchBlock(field, iterationPath));
        }
        else {
            patchDocument.push(createFieldPatchBlock(field, workItem.fields[field]));
        }
    });
    const comment = `This work item was ${createHtmlLink("http://aka.ms/split", "split")} from work item ${createWorkItemHtmlLink(workItem.id)}: ${workItem.fields[CoreFields.Title]}`;
    patchDocument.push(createFieldPatchBlock(CoreFields.History, comment));

    return getClientWit().createWorkItem(patchDocument, context.project.name, workItem.fields[CoreFields.WorkItemType]);
}

function findNextIteration(sourceWorkItem: WorkItem): IPromise<string> {
    const currentIterationPath = sourceWorkItem.fields[CoreFields.IterationPath];

    const context = VSS.getWebContext();
    const teamContext = {
        project: context.project.name,
        projectId: context.project.id,
        team: context.team.name,
        teamId: context.team.id
    };

    return getClientWork().getTeamIterations(teamContext).then((iterations: TeamSettingsIteration[]) => {
        let index = 0;
        let found = false;
        for (let len = iterations.length; index < len; index++) {
            const iteration = iterations[index];
            if (currentIterationPath === iteration.path) {
                found = true;
                break;
            }
        }
        if (!found || index >= iterations.length - 1) {
            return currentIterationPath;
        }
        else {
            return iterations[index + 1].path;
        }
    });
}

async function performSplit(id: number, childIdsToMove: number[], copyTags: boolean, title?: string): Promise<WorkItem> {
    const sourceWorkItem = await getClientWit().getWorkItem(id, null, null, WorkItemExpand.All);
    const iterationPath = await findNextIteration(sourceWorkItem);
    const targetWorkItem = await createWorkItem(sourceWorkItem, copyTags, title, iterationPath);
    await updateLinkRelations(sourceWorkItem, targetWorkItem, childIdsToMove);
    await updateIterationPath(childIdsToMove, iterationPath)
    return targetWorkItem;
}

function showDialog(workItemId: number) {
    let _dialog: IExternalDialog;
    let _contribution: any;
    
    const dialogOptions = <IHostDialogOptions>{
        title: "Split work item",
        draggable: true,
        modal: true,
        okText: "Split",
        cancelText: "Cancel",
        height: 450,
        width: 500,
        resizable: false,
        useBowtieStyle: false,
        bowtieVersion: 2,
        getDialogResult: () => {
            return _contribution.getDetails();
        },
        okCallback: (details: { ids: number[], title: string, shouldOpenNewWorkItem: boolean, shouldCopyTags: boolean }) => {
            if (details.ids && details.ids.length > 0) {
                performSplit(workItemId, details.ids, details.shouldCopyTags, details.title).then((splitWorkItem: WorkItem) => {
                    _dialog.close();

                    if (details.shouldOpenNewWorkItem) {
                        VSS.getService(WorkItemFormNavigationService.contributionId).then((service: IWorkItemFormNavigationService) => {
                            service.openWorkItem(splitWorkItem.id);
                        });
                    }
                });
            }
        }
    };

    VSS.getService(VSS.ServiceIds.Dialog).then((dialogSvc: IHostDialogService) => {
        const extensionCtx = VSS.getExtensionContext();
        const splitWorkDialogContributionId = extensionCtx.publisherId + "." + extensionCtx.extensionId + ".vsts-extension-split-work-dialog";
        dialogSvc.openDialog(splitWorkDialogContributionId, dialogOptions).then((dialog: IExternalDialog) => {
            _dialog = dialog;
            dialog.getContributionInstance(splitWorkDialogContributionId).then((contribution: any) => {
                _contribution = contribution;
                contribution.startSplit(workItemId).then(enable => {
                    if (enable) {
                        dialog.updateOkButton(true);
                    }
                });
            });
        });
    });
}

const actionProvider = {
    getMenuItems: (context) => {
        return [<IContributedMenuItem>{
            text: "Split",
            title: "Split",
            icon: "img/icon.png",
            action: (actionContext) => {
                const workItemId = actionContext.id
                    || actionContext.workItemId
                    || (actionContext.ids && actionContext.ids.length > 0 && actionContext.ids[0])
                    || (actionContext.workItemIds && actionContext.workItemIds.length > 0 && actionContext.workItemIds[0]);

                if (workItemId) {
                    showDialog(workItemId);
                }
            }
        }];
    }
};
VSS.register(VSS.getContribution().id, actionProvider);
VSS.notifyLoadSucceeded();
