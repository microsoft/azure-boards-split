const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getChildIds,
    getExcludedStateNames,
    getIncompleteChildren,
    loadIncompleteChildren,
    getNextIterationPath,
    performWorkItemSplit
} = require('../.test-build/scripts/splitLogic.js');

const FIELDS = {
    area: 'System.AreaPath',
    assigned: 'System.AssignedTo',
    description: 'System.Description',
    history: 'System.History',
    iteration: 'System.IterationPath',
    state: 'System.State',
    title: 'System.Title',
    type: 'System.WorkItemType',
    tags: 'System.Tags'
};

const context = {
    collection: { uri: 'https://dev.azure.test/collection/' },
    project: { name: 'Project', id: 'project-id' },
    team: { name: 'Team', id: 'team-id' }
};

function makeWorkItem(id, overrides = {}) {
    return {
        id,
        fields: {
            [FIELDS.type]: 'User Story',
            [FIELDS.title]: `Work item ${id}`,
            [FIELDS.iteration]: 'Project\\Sprint 1',
            [FIELDS.area]: 'Project\\Area',
            [FIELDS.assigned]: 'Dev User',
            [FIELDS.description]: 'Description',
            [FIELDS.tags]: 'tag-a; tag-b',
            ...overrides.fields
        },
        relations: overrides.relations || []
    };
}

function createDependencies(overrides = {}) {
    const calls = [];
    const source = overrides.source || makeWorkItem(10);
    const target = overrides.target || makeWorkItem(20);
    const dependencies = {
        context,
        getWorkItem: async id => {
            calls.push(['getWorkItem', id]);
            return source;
        },
        getWorkItemType: async (project, type) => {
            calls.push(['getWorkItemType', project, type]);
            return { fields: [] };
        },
        createWorkItem: async (patch, project, type) => {
            calls.push(['createWorkItem', patch, project, type]);
            return target;
        },
        updateWorkItem: async (patch, id) => {
            calls.push(['updateWorkItem', patch, id]);
            return makeWorkItem(id);
        },
        getTeamIterations: async teamContext => {
            calls.push(['getTeamIterations', teamContext]);
            return [{ path: 'Project\\Sprint 1' }, { path: 'Project\\Sprint 2' }];
        }
    };
    Object.assign(dependencies, overrides.dependencies);
    return { dependencies, calls, source, target };
}

function patchValue(patch, field) {
    const operation = patch.find(item => item.path === `/fields/${field}`);
    return operation && operation.value;
}

test('getChildIds returns only hierarchy-forward relation ids', () => {
    const item = makeWorkItem(1, { relations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.test/_apis/wit/workItems/2' },
        { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.test/_apis/wit/workItems/3' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.test/_apis/wit/workItems/4' }
    ] });
    assert.deepEqual(getChildIds(item), [2, 4]);
    assert.deepEqual(getChildIds(makeWorkItem(2)), []);
});

test('getExcludedStateNames includes custom completed and removed states only', () => {
    assert.deepEqual(getExcludedStateNames([
        { name: 'Ready', category: 'Proposed' },
        { name: 'Shipped', category: 'Completed' },
        { name: 'Rejected', category: 'Removed' }
    ]), ['Shipped', 'Rejected']);
});

test('getIncompleteChildren uses per-type categories and default exclusions when absent', () => {
    const children = [
        makeWorkItem(1, { fields: { [FIELDS.state]: 'Active' } }),
        makeWorkItem(2, { fields: { [FIELDS.state]: 'Shipped' } }),
        makeWorkItem(3, { fields: { [FIELDS.type]: 'Bug', [FIELDS.state]: 'Closed' } }),
        makeWorkItem(4, { fields: { [FIELDS.type]: 'Bug', [FIELDS.state]: 'Active' } })
    ];
    assert.deepEqual(
        getIncompleteChildren(children, { 'User Story': ['Shipped'] }).map(item => item.id),
        [1, 4]
    );
});

test('getIncompleteChildren treats an explicitly empty custom exclusion list as empty', () => {
    const child = makeWorkItem(1, { fields: { [FIELDS.state]: 'Closed' } });
    assert.deepEqual(getIncompleteChildren([child], { 'User Story': [] }), [child]);
});

test('getNextIterationPath selects the next sprint and falls back when absent or last', () => {
    const source = makeWorkItem(1);
    const iterations = [{ path: 'Project\\Sprint 1' }, { path: 'Project\\Sprint 2' }];
    assert.equal(getNextIterationPath(source, iterations), 'Project\\Sprint 2');
    assert.equal(getNextIterationPath(makeWorkItem(1, { fields: { [FIELDS.iteration]: 'Other' } }), iterations), 'Other');
    assert.equal(getNextIterationPath(source, [{ path: 'Project\\Sprint 1' }]), 'Project\\Sprint 1');
    assert.equal(getNextIterationPath(source, []), 'Project\\Sprint 1');
});

test('performWorkItemSplit creates a target using title, next iteration and requested tags', async () => {
    const { dependencies, calls, source, target } = createDependencies({
        dependencies: {
            getWorkItemType: async () => ({ fields: [
                { referenceName: 'Custom.Required', alwaysRequired: true },
                { referenceName: 'custom.required', alwaysRequired: true },
                { referenceName: 'System.State', alwaysRequired: true },
                { referenceName: 'System.IterationId', alwaysRequired: true },
                { referenceName: 'Custom.Optional', alwaysRequired: false }
            ] })
        }
    });

    const result = await performWorkItemSplit(10, [], true, 'New title', dependencies);
    const createCall = calls.find(call => call[0] === 'createWorkItem');
    const patch = createCall[1];

    assert.equal(result, target);
    assert.equal(createCall[2], 'Project');
    assert.equal(createCall[3], 'User Story');
    assert.equal(patchValue(patch, FIELDS.title), 'New title');
    assert.equal(patchValue(patch, FIELDS.iteration), 'Project\\Sprint 2');
    assert.equal(patchValue(patch, FIELDS.tags), 'tag-a; tag-b');
    assert.equal(patchValue(patch, 'Custom.Required'), '');
    assert.equal(patch.some(item => item.path === '/fields/System.State'), false);
    assert.equal(patch.some(item => item.path === '/fields/System.IterationId'), false);
    assert.equal(patch.some(item => item.path === '/fields/Custom.Optional'), false);
    assert.equal(patch.filter(item => item.path === '/fields/Custom.Required').length, 1);
    assert.match(patchValue(patch, FIELDS.history), /work item 10/i);
    assert.equal(source.id, 10);
});

test('create patch preserves source title and omits tags when overrides are not provided', async () => {
    const { dependencies, calls } = createDependencies();
    await performWorkItemSplit(10, [], false, '', dependencies);
    const patch = calls.find(call => call[0] === 'createWorkItem')[1];
    assert.equal(patchValue(patch, FIELDS.title), 'Work item 10');
    assert.equal(patchValue(patch, FIELDS.tags), undefined);
    assert.equal(patchValue(patch, FIELDS.iteration), 'Project\\Sprint 2');
});

test('integration: moves parent, selected children and attachments, then updates child iterations', async () => {
    const source = makeWorkItem(10, { relations: [
        { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'parent/99' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/11' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/12' },
        { rel: 'AttachedFile', url: 'attachment/abc', attributes: {
            name: 'spec.txt', resourceCreatedDate: 'created', resourceModifiedDate: 'modified', resourceSize: 12
        } },
        { rel: 'System.LinkTypes.Related', url: 'related/13' }
    ] });
    const { dependencies, calls, target } = createDependencies({ source });

    const result = await performWorkItemSplit(10, [11], false, undefined, dependencies);
    const updates = calls.filter(call => call[0] === 'updateWorkItem');
    const removedRelationsPatch = updates.find(call => call[2] === 10)[1];
    const movedRelationsPatch = updates.find(call => call[2] === 20)[1];
    const addedRelations = movedRelationsPatch.filter(item => item.path === '/relations/-').map(item => item.value);

    assert.equal(result, target);
    assert.deepEqual(calls.map(call => call[0]), [
        'getWorkItem', 'getTeamIterations', 'getWorkItemType', 'createWorkItem',
        'updateWorkItem', 'updateWorkItem', 'updateWorkItem'
    ]);
    assert.deepEqual(removedRelationsPatch.slice(0, 1), [{ op: 'remove', path: '/relations/1' }]);
    assert.equal(addedRelations.length, 3);
    assert.equal(addedRelations.some(relation => relation.url === 'child/11'), true);
    assert.equal(addedRelations.some(relation => relation.url === 'child/12'), false);
    assert.equal(addedRelations.some(relation => relation.rel === 'System.LinkTypes.Hierarchy-Reverse'), true);
    assert.deepEqual(addedRelations.find(relation => relation.rel === 'AttachedFile'), {
        rel: 'AttachedFile',
        url: 'attachment/abc',
        title: null,
        attributes: {
            name: 'spec.txt', resourceCreatedDate: 'created', resourceModifiedDate: 'modified', resourceSize: 12
        }
    });
    assert.deepEqual(updates.filter(call => call[2] === 11 || call[2] === 12).map(call => call[2]), [11]);
    assert.equal(patchValue(updates.find(call => call[2] === 11)[1], FIELDS.iteration), 'Project\\Sprint 2');
    assert.match(patchValue(removedRelationsPatch, FIELDS.history), /_workitems\/edit\/20/);
});

test('integration: removes multiple child relations in descending index order', async () => {
    const source = makeWorkItem(10, { relations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/11' },
        { rel: 'System.LinkTypes.Related', url: 'child/12' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/12' }
    ] });
    const { dependencies, calls } = createDependencies({ source });
    await performWorkItemSplit(10, [11, 12], false, undefined, dependencies);
    const sourceUpdate = calls.find(call => call[0] === 'updateWorkItem' && call[2] === 10);
    assert.deepEqual(sourceUpdate[1].slice(0, 3), [
        { op: 'remove', path: '/relations/2' },
        { op: 'remove', path: '/relations/1' },
        { op: 'remove', path: '/relations/0' }
    ]);
});

test('integration: no selected children skips source-link and iteration updates', async () => {
    const { dependencies, calls } = createDependencies();
    await performWorkItemSplit(10, [], false, undefined, dependencies);
    assert.equal(calls.filter(call => call[0] === 'updateWorkItem').length, 0);
});

test('integration: source lookup failure stops the split before external writes', async () => {
    const failure = new Error('source unavailable');
    const { dependencies, calls } = createDependencies({
        dependencies: { getWorkItem: async id => { calls.push(['getWorkItem', id]); throw failure; } }
    });
    await assert.rejects(performWorkItemSplit(10, [11], false, undefined, dependencies), failure);
    assert.deepEqual(calls.map(call => call[0]), ['getWorkItem']);
});

test('integration: create failure does not mutate links or child iteration paths', async () => {
    const failure = new Error('create rejected');
    const { dependencies, calls } = createDependencies({
        dependencies: { createWorkItem: async () => { throw failure; } }
    });
    await assert.rejects(performWorkItemSplit(10, [11], false, undefined, dependencies), failure);
    assert.deepEqual(calls.map(call => call[0]), ['getWorkItem', 'getTeamIterations', 'getWorkItemType']);
});

test('integration: link-update failure prevents iteration updates', async () => {
    const failure = new Error('link update rejected');
    const { dependencies, calls } = createDependencies({
        dependencies: {
            updateWorkItem: async (_patch, id) => {
                calls.push(['updateWorkItem', [], id]);
                throw failure;
            }
        }
    });
    await assert.rejects(performWorkItemSplit(10, [11], false, undefined, dependencies), failure);
    assert.deepEqual(calls.filter(call => call[0] === 'updateWorkItem').map(call => call[2]), [10]);
});

test('loadIncompleteChildren batches children and fetches each work item type state list once', async () => {
    const parent = makeWorkItem(10, { relations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/11' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/12' },
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/13' }
    ] });
    const children = [
        makeWorkItem(11, { fields: { [FIELDS.state]: 'Active' } }),
        makeWorkItem(12, { fields: { [FIELDS.state]: 'Released' } }),
        makeWorkItem(13, { fields: { [FIELDS.type]: 'Bug', [FIELDS.state]: 'Active' } })
    ];
    const calls = [];
    const result = await loadIncompleteChildren(parent, 'Project', {
        getWorkItems: async ids => { calls.push(['getWorkItems', ids]); return children; },
        getWorkItemTypeStates: async (project, type) => {
            calls.push(['getWorkItemTypeStates', project, type]);
            return type === 'User Story'
                ? [{ category: 'Proposed', name: 'New' }, { category: 'Completed', name: 'Released' }]
                : [{ category: 'In Progress', name: 'Active' }];
        }
    });

    assert.deepEqual(result.map(child => child.id), [11, 13]);
    assert.deepEqual(calls, [
        ['getWorkItems', [11, 12, 13]],
        ['getWorkItemTypeStates', 'Project', 'User Story'],
        ['getWorkItemTypeStates', 'Project', 'Bug']
    ]);
});

test('loadIncompleteChildren does not call services when the parent has no children', async () => {
    const parent = makeWorkItem(10);
    const calls = [];
    const result = await loadIncompleteChildren(parent, 'Project', {
        getWorkItems: async ids => { calls.push(['getWorkItems', ids]); return []; },
        getWorkItemTypeStates: async () => { calls.push(['getWorkItemTypeStates']); return []; }
    });
    assert.deepEqual(result, []);
    assert.deepEqual(calls, []);
});

test('loadIncompleteChildren propagates work item service failures', async () => {
    const failure = new Error('child query failed');
    const parent = makeWorkItem(10, { relations: [
        { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'child/11' }
    ] });
    await assert.rejects(loadIncompleteChildren(parent, 'Project', {
        getWorkItems: async () => { throw failure; },
        getWorkItemTypeStates: async () => []
    }), failure);
});