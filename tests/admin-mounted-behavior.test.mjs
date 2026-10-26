import assert from 'node:assert/strict';
import test from 'node:test';
import {componentHarness, nodes, text, control, deferred} from './helpers/vendor-component-harness.mjs';
import {adminModule, clientEnvironment, ok, licenseSnapshot, licenseRequest, licenseReceipt, ticket, ticketList, stamp, loadProduction} from './helpers/frontend-production-modules.mjs';

const event = {preventDefault() {}};
const components = {UiFormField: ({children}) => children,
  UiStatCard: ({title, value, helper}) => ({type: 'div', props: {children: [title, value, helper]}})};
const settle = async h => {await new Promise(setImmediate); await h.flush(); await new Promise(setImmediate); await h.flush();};

async function supportEnvironment(fetcher) {
  const env = clientEnvironment(fetcher, {config: {retryPolicy: {maxAttempts: 1}}});
  const h = componentHarness(), dataset = adminModule('support/supportDataset.ts', env.api);
  const module = await h.load('apps/admin/src/features/support/AdminHelpSupportPage.tsx', {
    'react-router-dom': {useLocation: () => ({pathname: '/admin/help-support'})},
    '../../../../../shared/ui/components': components, './supportDataset': dataset,
  });
  h.mount(module.default); await settle(h); return {h, env};
}

test('mounted support distinguishes pending, failed and verified empty reads and retries the real adapter', async () => {
  const pending = deferred(); let retry = false;
  const {h, env} = await supportEnvironment(() => retry ? ok(ticketList()) : pending.promise);
  assert.match(text(h.tree), /Loading authoritative requests/u); assert.doesNotMatch(text(h.tree), /No authoritative requests/u);
  pending.reject(Error('offline')); await settle(h);
  assert.ok(nodes(h.tree).some(node => node?.props?.role === 'alert'));
  assert.doesNotMatch(text(h.tree), /No authoritative requests/u);
  retry = true; control(h.tree, 'button', 'Retry loading').props.onClick(); await settle(h);
  assert.match(text(h.tree), /No authoritative requests match these filters/u); assert.equal(env.calls.length, 2);
  h.unmount();
});

test('mounted support ignores late success and rejection after a different ticket owns the conversation', async () => {
  for (const rejection of [false, true]) {
    const old = deferred(), current = deferred();
    const {h} = await supportEnvironment(url => url.includes('/tickets/ticket-a') ? old.promise :
      url.includes('/tickets/ticket-b') ? current.promise : ok(ticketList([ticket('ticket-a'), ticket('ticket-b')])));
    control(h.tree, 'button', 'Subject ticket-a').props.onClick(); await settle(h);
    control(h.tree, 'button', 'Subject ticket-b').props.onClick(); await settle(h);
    const detail = (id, body) => ({ticket: ticket(id), messages: {nextCursor: null,
      items: [{messageId: `message-${id}`, ticketId: id, authorType: 'institute', authorDisplayName: 'Unit admin',
        body, createdAt: '2026-10-24T09:00:00.000Z', sequence: 1, attachments: []}]}});
    current.resolve(ok(detail('ticket-b', 'Current conversation body'))); await settle(h);
    assert.match(text(h.tree), /Current conversation body/u);
    if (rejection) old.reject(Error('Late old failure')); else old.resolve(ok(detail('ticket-a', 'Late private conversation')));
    await settle(h); assert.match(text(h.tree), /Current conversation body/u);
    assert.doesNotMatch(text(h.tree), /Late old failure|Late private conversation/u); h.unmount();
  }
});

test('mounted licensing withholds success during reload, retains exact failed intent and confirms only the replayed reload', async () => {
  const pendingReload = deferred(), commands = []; let reads = 0;
  const env = clientEnvironment((_url, options) => {
    const body = JSON.parse(options.body);
    if (body.actionType === 'REQUEST_LICENSE_UPGRADE') {
      commands.push(body); const receipt = licenseReceipt(); if (commands.length > 1) receipt.disposition = 'replayed';
      return ok({actionType: body.actionType, receipt});
    }
    reads++; if (reads === 2) return pendingReload.promise;
    const snapshot = licenseSnapshot();
    if (reads > 2) snapshot.requests = {items: [licenseRequest()], openRequestId: 'request-a', nextCursor: null};
    return ok({actionType: 'GET_LICENSE_SNAPSHOT', snapshot});
  });
  const dataset = adminModule('licensing/licensingDataset.ts', env.api), h = componentHarness();
  const module = await h.load('apps/admin/src/features/licensing/AdminLicensingWorkspace.tsx', {
    '../../../../../shared/services/managedAssetPolicy': {safeBusinessUrl: value => value},
    'react-router-dom': {useLocation: () => ({pathname: '/admin/licensing/plans'}), useNavigate: () => () => {}},
    '../../../../../shared/services/authProvider': {useAuthProvider: () => ({session: {idToken: 'unit-token'}})},
    '../../../../../shared/ui/components': components,
    '../../portals/adminAccess': {hasAdminCapability: () => true, resolveAdminAccessContext: () => ({})},
    './licensingDataset': dataset,
  });
  h.mount(module.default); await settle(h);
  nodes(h.tree).find(node => node?.props?.id === 'admin-license-request-reason').props.onChange({target: {value: licenseRequest().reason}});
  h.render();
  const form = () => nodes(h.tree).find(node => node?.type === 'form');
  const first = form().props.onSubmit(event); await settle(h);
  assert.equal(reads, 2); assert.equal(commands.length, 1);
  assert.equal(control(h.tree, 'button', 'Submitting...').props.disabled, true);
  assert.doesNotMatch(text(h.tree), /The request was submitted and confirmed|The existing request was confirmed/u);
  pendingReload.reject(Error('reload failed')); await first; await settle(h);
  assert.doesNotMatch(text(h.tree), /The request was submitted and confirmed|The existing request was confirmed/u);
  assert.equal(nodes(h.tree).find(node => node?.props?.id === 'admin-license-request-reason').props.value, licenseRequest().reason);
  await form().props.onSubmit(event); await settle(h);
  assert.equal(commands.length, 2); assert.deepEqual(commands[1], commands[0]);
  assert.match(text(h.tree), /The existing request was confirmed by authoritative reload/u);
  h.unmount();
});

test('mounted settings preserves edited intent across same-authority JWT refresh and reloads changed authority', async () => {
  const claims = {instituteId: 'tenant-a', authorizationVersion: 1, role: 'admin'};
  const token = signature => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
  const session = {status: 'authenticated', user: {uid: 'actor-a'}, idToken: token('first')};
  let snapshot, sent;
  const env = clientEnvironment((_url, options) => {
    const body = JSON.parse(options.body);
    if (body.actionType === 'UPDATE_INSTITUTE_PROFILE') {
      sent = structuredClone(body);
      snapshot = {...snapshot, revision: body.expectedRevision + 1, profile: {...snapshot.profile, ...body.profile},
        audit: {nextCursor: null, items: [{eventId: 'audit-settings-a', occurredAt: stamp,
          actorUserId: 'actor-a', actionType: body.actionType, area: 'institute_profile', targetId: 'tenant-a',
          summary: 'Updated institute profile', revision: body.expectedRevision + 1}]}};
      return ok({actionType: body.actionType, snapshot, receipt: {commandId: body.commandId,
        auditEventId: 'audit-settings-a', completedAt: stamp, replayed: false, revision: snapshot.revision}});
    }
    return ok({actionType: 'GET_SETTINGS_SNAPSHOT', snapshot});
  }, {getToken: async () => session.idToken});
  const dataset = adminModule('settings/settingsDataset.ts', env.api), h = componentHarness();
  snapshot = structuredClone(dataset.FALLBACK_SNAPSHOT);
  snapshot.academicYears = []; snapshot.users = []; snapshot.audit.items = [];
  const module = await h.load('apps/admin/src/features/settings/AdminSettingsWorkspace.tsx', {
    'react-router-dom': {useLocation: () => ({pathname: '/admin/settings/profile'}), useNavigate: () => () => {}},
    '../../../../../shared/services/authProvider': {useAuthProvider: () => ({session})},
    '../../../../../shared/services/authSessionConvergence': loadProduction('shared/services/authSessionConvergence.ts'),
    '../../../../../shared/services/globalPortalState': {resolveGlobalPortalState: () => ({role: claims.role,
      authorizationVersion: claims.authorizationVersion, license: {licenseVersion: 'version-a'}, authorityIssue: null, isSuspended: false})},
    '../../../../../shared/ui/components': components,
    '../../portals/adminAccess': {hasAdminCapability: () => true, resolveAdminAccessContext: () => ({})},
    './settingsDataset': dataset,
  });
  const field = id => nodes(h.tree).find(node => node?.props?.id === id);
  h.mount(module.default);
  assert.equal(field('settings-email').props.disabled, true);
  await settle(h);
  for (const [id, value] of [['settings-email', 'edited@example.test'], ['settings-phone', '+1-555-0102'],
    ['settings-timezone', 'Asia/Kolkata']]) field(id).props.onChange({target: {value}});
  h.render();
  session.idToken = token('refreshed'); h.render(); await settle(h);
  assert.equal(env.calls.length, 1);
  assert.equal(field('settings-email').props.value, 'edited@example.test');
  await nodes(h.tree).find(node => node?.type === 'form').props.onSubmit(event); await settle(h);
  assert.equal(sent.profile.contactEmail, 'edited@example.test');
  assert.equal(sent.profile.contactPhone, '+1-555-0102');
  assert.equal(sent.profile.timeZone, 'Asia/Kolkata');
  assert.match(text(h.tree), /Institute profile saved/u);
  assert.equal(env.calls.length, 3);
  claims.authorizationVersion = 2; session.idToken = token('changed-authority');
  snapshot.profile.contactEmail = 'current-authority@example.test';
  h.render(); await settle(h);
  assert.equal(env.calls.length, 4);
  assert.equal(field('settings-email').props.value, 'current-authority@example.test');
  claims.instituteId = 'tenant-b'; session.idToken = token('other-institute');
  snapshot.profile.contactEmail = 'other-institute@example.test';
  h.render(); await settle(h);
  assert.equal(env.calls.length, 5);
  assert.equal(field('settings-email').props.value, 'other-institute@example.test');
  h.unmount();
});
