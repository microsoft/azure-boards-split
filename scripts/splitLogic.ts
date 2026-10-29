import { AdditionalFields, CoreFields } from "./constants";

export interface SplitWorkItem {
    id: number;
    fields: Record<string, any>;
    relations?: SplitWorkItemRelation[];
}

export interface SplitWorkItemRelation {
    rel: string;
    url: string;
    title?: string | null;
    attributes?: Record<string, any>;
}

export interface SplitContext {
    collection: { uri: string };
    project: { name: string; id: string };
    team: { name: string; id: string };
}

export interface SplitTeamContext {
    project: string;
    projectId: string;
    team: string;
    teamId: string;
}

export interface SplitDependencies<T extends SplitWorkItem = SplitWorkItem> {
    context: SplitContext;
    getWorkItem: (id: number) => Promise<T>;
    getWorkItemType: (project: string, type: string) => Promise<{ fields: Array<{ referenceName: string; alwaysRequired: boolean }> }>;
    createWorkItem: (patch: WorkItemPatch[], project: string, type: string) => Promise<T>;
    updateWorkItem: (patch: WorkItemPatch[], id: number) => Promise<T>;
    getTeamIterations: (context: SplitTeamContext) => Promise<Array<{ path: string }>>;
}

export interface WorkItemPatch {
    op: "add" | "remove";
    path: string;
    value?: any;
}

export interface ChildWorkItemClient<T extends SplitWorkItem = SplitWorkItem> {
    getWorkItems: (ids: number[]) => Promise<T[]>;
    getWorkItemTypeStates: (project: string, type: string) => Promise<Array<{ category: string; name: string }>>;
}

const defaultExcludedStates = ["Closed", "Removed", "Cut", "Done", "Completed"];

export function getChildIds(workItem: SplitWorkItem): number[] {
    return (workItem.relations || [])
        .filter(relation => relation.rel === "System.LinkTypes.Hierarchy-Forward")
        .map(relation => parseInt(relation.url.substring(relation.url.lastIndexOf("/") + 1), 10));
}

export function getExcludedStateNames(states: Array<{ category: string; name: string }>): string[] {
    return states
        .filter(state => state.category === "Completed" || state.category === "Removed")
        .map(state => state.name);
}

export function getIncompleteChildren<T extends SplitWorkItem>(
    children: T[],
    excludedStatesByType: Record<string, string[]>
): T[] {
    return children.filter(child => {
        const type = child.fields[CoreFields.WorkItemType];
        const excludedStates = excludedStatesByType[type] || defaultExcludedStates;
        return excludedStates.indexOf(child.fields[CoreFields.State]) === -1;
    });
}

export function getNextIterationPath(sourceWorkItem: SplitWorkItem, iterations: Array<{ path: string }>): string {
    const currentPath = sourceWorkItem.fields[CoreFields.IterationPath];
    let currentIndex = -1;
    for (let index = 0; index < iterations.length; index++) {
        if (iterations[index].path === currentPath) {
            currentIndex = index;
            break;
        }
    }
    return currentIndex < 0 || currentIndex >= iterations.length - 1
        ? currentPath
        : iterations[currentIndex + 1].path;
}

function createFieldPatch(field: string, value: any): WorkItemPatch {
    return { op: "add", path: "/fields/" + field, value: value === undefined ? "" : value };
}

function createHtmlLink(link: string, text: number | string): string {
    return `<a href="${link}" target="_blank">${text}</a>`;
}

function createWorkItemHtmlLink(context: SplitContext, id: number): string {
    const link = `${context.collection.uri}${context.project.name}/_workitems/edit/${id}`;
    return createHtmlLink(link, id);
}

async function createSplitWorkItem<T extends SplitWorkItem>(
    workItem: T,
    copyTags: boolean,
    title: string | undefined,
    iterationPath: string,
    dependencies: SplitDependencies<T>
): Promise<T> {
    const context = dependencies.context;
    const workItemType = workItem.fields[CoreFields.WorkItemType];
    const fieldsToCopy = [
        CoreFields.Title,
        CoreFields.AssignedTo,
        CoreFields.IterationPath,
        CoreFields.AreaPath,
        CoreFields.Description,
        AdditionalFields.AcceptanceCriteria,
        AdditionalFields.ReproSteps,
        AdditionalFields.SystemInfo
    ];
    const typeInfo = await dependencies.getWorkItemType(context.project.name, workItemType);

    typeInfo.fields.forEach(field => {
        const referenceName = field.referenceName.toLowerCase();
        const isIgnored = referenceName === AdditionalFields.IterationId.toLowerCase()
            || referenceName === CoreFields.State.toLowerCase();
        if (field.alwaysRequired && !isIgnored
            && !fieldsToCopy.some(existing => existing.toLowerCase() === referenceName)) {
            fieldsToCopy.push(field.referenceName);
        }
    });

    if (copyTags) {
        fieldsToCopy.push(CoreFields.Tags);
    }

    const patch = fieldsToCopy.map(field => {
        if (field === CoreFields.Title && title && title.length > 0) {
            return createFieldPatch(field, title);
        }
        if (field === CoreFields.IterationPath && iterationPath) {
            return createFieldPatch(field, iterationPath);
        }
        return createFieldPatch(field, workItem.fields[field]);
    });
    const history = `This work item was ${createHtmlLink("http://aka.ms/split", "split")} from work item ${createWorkItemHtmlLink(context, workItem.id)}: ${workItem.fields[CoreFields.Title]}`;
    patch.push(createFieldPatch(CoreFields.History, history));

    return dependencies.createWorkItem(patch, context.project.name, workItemType);
}

async function removeChildLinks<T extends SplitWorkItem>(
    workItem: T,
    childIds: number[],
    targetId: number,
    dependencies: SplitDependencies<T>
): Promise<T> {
    if (childIds.length === 0) {
        return workItem;
    }

    const relations = workItem.relations || [];
    const indices: number[] = [];
    relations.forEach((relation, index) => {
        const relationId = parseInt(relation.url.substring(relation.url.lastIndexOf("/") + 1), 10);
        if (childIds.indexOf(relationId) !== -1) {
            indices.unshift(index);
        }
    });

    const patch: WorkItemPatch[] = indices.map(index => ({ op: "remove", path: "/relations/" + index }));
    const childLinks = childIds.map(id => createWorkItemHtmlLink(dependencies.context, id)).join(", ");
    const comment = `The following items were ${createHtmlLink("http://aka.ms/split", "split")} to work item ${createWorkItemHtmlLink(dependencies.context, targetId)}:<br>&nbsp;&nbsp;${childLinks}`;
    patch.push(createFieldPatch(CoreFields.History, comment));
    return dependencies.updateWorkItem(patch, workItem.id);
}

async function addRelations<T extends SplitWorkItem>(
    workItem: T,
    relations: SplitWorkItemRelation[],
    dependencies: SplitDependencies<T>
): Promise<T> {
    if (relations.length === 0) {
        return workItem;
    }
    const patch = relations.map(relation => ({ op: "add" as const, path: "/relations/-", value: relation }));
    return dependencies.updateWorkItem(patch, workItem.id);
}

async function moveRelations<T extends SplitWorkItem>(
    source: T,
    target: T,
    childIds: number[],
    dependencies: SplitDependencies<T>
): Promise<void> {
    const relations = source.relations || [];
    const parentRelations = relations.filter(relation => relation.rel === "System.LinkTypes.Hierarchy-Reverse");
    const childRelations = relations.filter(relation => {
        if (relation.rel !== "System.LinkTypes.Hierarchy-Forward") {
            return false;
        }
        const id = parseInt(relation.url.substring(relation.url.lastIndexOf("/") + 1), 10);
        return childIds.indexOf(id) !== -1;
    });
    const attachmentRelations = relations.filter(relation => relation.rel === "AttachedFile").map(relation => ({
        rel: relation.rel,
        url: relation.url,
        title: null,
        attributes: {
            name: relation.attributes && relation.attributes.name,
            resourceCreatedDate: relation.attributes && relation.attributes.resourceCreatedDate,
            resourceModifiedDate: relation.attributes && relation.attributes.resourceModifiedDate,
            resourceSize: relation.attributes && relation.attributes.resourceSize
        }
    }));

    await removeChildLinks(source, childIds, target.id, dependencies);
    await addRelations(target, parentRelations.concat(childRelations, attachmentRelations), dependencies);
}

async function updateChildIterations(childIds: number[], iterationPath: string, dependencies: SplitDependencies): Promise<void> {
    await Promise.all(childIds.map(childId =>
        dependencies.updateWorkItem([createFieldPatch(CoreFields.IterationPath, iterationPath)], childId)));
}

export async function performWorkItemSplit<T extends SplitWorkItem>(
    id: number,
    childIds: number[],
    copyTags: boolean,
    title: string | undefined,
    dependencies: SplitDependencies<T>
): Promise<T> {
    const source = await dependencies.getWorkItem(id);
    const context = dependencies.context;
    const teamContext = {
        project: context.project.name,
        projectId: context.project.id,
        team: context.team.name,
        teamId: context.team.id
    };
    const iterations = await dependencies.getTeamIterations(teamContext);
    const iterationPath = getNextIterationPath(source, iterations);
    const target = await createSplitWorkItem(source, copyTags, title, iterationPath, dependencies);
    await moveRelations(source, target, childIds, dependencies);
    await updateChildIterations(childIds, iterationPath, dependencies);
    return target;
}

export async function loadIncompleteChildren<T extends SplitWorkItem>(
    workItem: SplitWorkItem,
    project: string,
    client: ChildWorkItemClient<T>
): Promise<T[]> {
    const childIds = getChildIds(workItem);
    if (childIds.length === 0) {
        return [];
    }

    const children = await client.getWorkItems(childIds);
    const excludedStatesByType: Record<string, string[]> = Object.create(null);
    for (const child of children) {
        const type = child.fields[CoreFields.WorkItemType];
        if (!Object.prototype.hasOwnProperty.call(excludedStatesByType, type)) {
            const states = await client.getWorkItemTypeStates(project, type);
            excludedStatesByType[type] = getExcludedStateNames(states);
        }
    }

    return getIncompleteChildren(children, excludedStatesByType);
}