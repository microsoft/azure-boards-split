/// <reference types="vss-web-extension-sdk" />

import { WorkItem, WorkItemExpand } from "TFS/WorkItemTracking/Contracts";
import { getClient as getClientWit } from"TFS/WorkItemTracking/RestClient";
import { IWorkItemFormNavigationService, WorkItemFormNavigationService } from"TFS/WorkItemTracking/Services";

import { getClient as getClientWork } from"TFS/Work/RestClient";

import { performWorkItemSplit } from "./splitLogic";

const performSplit = (id: number, childIdsToMove: number[], copyTags: boolean, title?: string): Promise<WorkItem> => {
    const context = VSS.getWebContext();
    const witClient = getClientWit();
    const workClient = getClientWork();
    return performWorkItemSplit(id, childIdsToMove, copyTags, title, {
        context,
        getWorkItem: async (workItemId) => witClient.getWorkItem(workItemId, null, null, WorkItemExpand.All),
        getWorkItemType: async (project, type) => witClient.getWorkItemType(project, type),
        createWorkItem: async (patch, project, type) => witClient.createWorkItem(patch, project, type),
        updateWorkItem: async (patch, workItemId) => witClient.updateWorkItem(patch, workItemId),
        getTeamIterations: async (teamContext) => workClient.getTeamIterations(teamContext)
    });
};

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
