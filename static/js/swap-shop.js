(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const base = '/swap-api';
  let user = null, scope = 'public', offset = 0, challenge = '', editing = null, retained = [], loading = false, sequence = 0;
  const say = message => { $('swap-message').textContent = message; };
  const error = e => { $('swap-error').hidden = false; $('swap-error').textContent = e.message || 'Unable to complete the request.'; if ($('swap-message').textContent.startsWith('Connecting')) say('Listings are temporarily unavailable.'); };
  const clearError = () => { $('swap-error').hidden = true; };
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  async function api(path, body) {
    const response = await fetch(base + path, { credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    let data;
    try { data = await response.json(); } catch { throw Error('The Swap Shop service is unavailable. Please try again later.'); }
    if (!response.ok) throw Error(data.error || 'The request failed.');
    return data;
  }
  async function task(button, fn) {
    if (button?.disabled) return;
    clearError();
    if (button) button.disabled = true;
    try { await fn(); } catch (e) { error(e); }
    finally { if (button) button.disabled = false; }
  }
  function account() {
    $('swap-login').hidden = !!user;
    $('swap-account').hidden = !user;
    $('swap-new').hidden = !user?.callsign;
    $('swap-identity').textContent = user ? `Signed in as ${user.email}${user.callsign ? ' · ' + user.callsign : ' · Current membership not verified'}${user.admin ? ' · Administrator' : ''}` : '';
    document.querySelector('[data-scope=mine]').hidden = !user;
    document.querySelector('[data-scope=admin]').hidden = !user?.admin;
  }
  function actionButton(card, listing, label, action) {
    const button = node('button', label);
    button.type = 'button';
    button.addEventListener('click', () => task(button, async () => {
      let reason = '';
      if (action.startsWith('reject')) { reason = window.prompt('Reason for the seller (required, at most 500 characters):'); if (!reason) return; }
      if (['remove','sold','withdraw'].includes(action) && !window.confirm(`${label}? This closes the listing immediately.`)) return;
      await api(`/listings/${listing.id}/action`, { action, version: listing.version, reason });
      say(action === 'renew' ? 'Renewal requested. The expiration date changes only when an administrator approves.' : 'Listing updated.');
      await load();
    }));
    card.append(button);
  }
  function photoElement(id, title) {
    const link = node('a'); link.href = `${base}/photos/${id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const img = node('img'); img.src = link.href; img.alt = `Photo of ${title}`; img.loading = 'lazy';
    link.append(img); return link;
  }
  function render(listing) {
    const card = node('article', undefined, 'swap-card');
    card.dataset.expires = listing.expires_at || '';
    card.append(node('p', `${listing.callsign} · ${listing.condition}`, 'swap-status'), node('h3', listing.title), node('p', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(listing.price_cents / 100), 'swap-price'));
    const photos = node('div', undefined, 'swap-photos');
    listing.photos.forEach(id => photos.append(photoElement(id, listing.title)));
    card.append(photos, node('p', listing.description, 'swap-description'), node('p', 'Seller contact: ' + listing.contact, 'swap-contact'));
    card.append(node('p', `${listing.status}${listing.renewal ? ' · renewal awaiting approval' : ''}${listing.expires_at ? ' · Expires ' + new Date(listing.expires_at).toLocaleString() : ''}`, 'swap-status'));
    if (listing.reason) card.append(node('p', 'Administrator note: ' + listing.reason));
    if (scope === 'mine') {
      if (['pending','approved','expired','rejected'].includes(listing.status)) {
        if (user.callsign) {
          const edit = node('button', 'Edit and resubmit'); edit.type = 'button';
          edit.addEventListener('click', () => openEditor(listing)); card.append(edit);
        }
        actionButton(card, listing, 'Mark sold', 'sold');
        actionButton(card, listing, 'Withdraw', 'withdraw');
      }
      if (user.callsign && ['approved','expired'].includes(listing.status) && !listing.renewal) actionButton(card, listing, 'Request 60-day renewal', 'renew');
    }
    if (scope === 'admin') {
      if (listing.status === 'pending') { actionButton(card, listing, 'Approve for 60 days', 'approve'); actionButton(card, listing, 'Reject', 'reject'); }
      if (listing.renewal) { actionButton(card, listing, 'Approve another 60 days', 'approve-renewal'); actionButton(card, listing, 'Decline renewal', 'reject-renewal'); }
      if (listing.status !== 'removed') actionButton(card, listing, 'Remove posting', 'remove');
    }
    $('swap-listings').append(card);
  }
  async function load(more = false) {
    if (more && loading) return;
    loading = true;
    const request = ++sequence;
    const selectedScope = scope;
    try {
      if (!more) { offset = 0; $('swap-listings').replaceChildren(); }
      const data = await api(`/listings?scope=${scope}&offset=${offset}&q=${encodeURIComponent($('swap-query').value)}`);
      if (scope !== selectedScope || request !== sequence) return;
      data.listings.forEach(render); offset += data.listings.length;
      $('swap-more').hidden = data.listings.length < 50;
      if (!offset) $('swap-listings').append(node('p', 'No listings in this view.'));
      $('listings-heading').textContent = { public: 'Browse equipment', mine: 'My listings', admin: 'Administrator moderation' }[scope];
      document.querySelectorAll('[data-scope]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.scope === scope)));
    } finally { if (request === sequence) loading = false; }
  }
  function openEditor(listing = null) {
    editing = listing; retained = [];
    $('swap-form').reset(); $('swap-kept-photos').replaceChildren();
    if (listing) {
      for (const name of ['title','description','condition','contact']) $('swap-form').elements[name].value = listing[name];
      $('swap-form').elements.price.value = (listing.price_cents / 100).toFixed(2);
      listing.photos.forEach(id => {
        const label = node('label'); const keep = node('input'); keep.type = 'checkbox'; keep.checked = true;
        label.append(photoElement(id, listing.title), keep, document.createTextNode('Keep photo'));
        $('swap-kept-photos').append(label); retained.push({ id, keep });
      });
    }
    $('swap-callsign').textContent = 'Verified roster callsign: ' + user.callsign;
    $('swap-editor').hidden = false; $('editor-heading').focus();
  }
  const base64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(Error('Could not read photo.')); reader.readAsDataURL(blob);
  });
  $('swap-request').addEventListener('submit', event => {
    event.preventDefault(); task(event.submitter, async () => {
      const result = await api('/auth/request', { email: $('swap-email').value }); challenge = result.challenge;
      $('swap-verify').hidden = false; $('swap-code').value = ''; $('swap-code').focus(); say(result.message);
    });
  });
  $('swap-verify').addEventListener('submit', event => {
    event.preventDefault(); task(event.submitter, async () => {
      user = (await api('/auth/verify', { challenge, code: $('swap-code').value })).user;
      $('swap-code').value = ''; challenge = ''; account(); scope = 'mine'; await load(); say('Email verified. You are signed in.');
    });
  });
  $('swap-logout').addEventListener('click', event => task(event.target, async () => {
    await api('/auth/logout', {}); user = null; account(); $('swap-editor').hidden = true; $('swap-verify').hidden = true; scope = 'public'; await load(); say('Signed out.');
  }));
  $('swap-new').addEventListener('click', () => openEditor());
  $('swap-cancel').addEventListener('click', () => { $('swap-editor').hidden = true; });
  $('swap-form').addEventListener('submit', event => {
    event.preventDefault(); task(event.submitter, async () => {
      const files = [...$('swap-photos').files], kept = retained.filter(p => p.keep.checked);
      if (files.length + kept.length > 5) throw Error('Choose at most five photos total.');
      if (files.some(f => f.size > 5 * 1024 * 1024)) throw Error('Each photo must be at most 5 MB.');
      const photos = [];
      for (const p of kept) {
        const response = await fetch(`${base}/photos/${p.id}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw Error('An existing photo is unavailable. Reload the listing.');
        photos.push(await base64(await response.blob()));
      }
      for (const file of files) photos.push(await base64(file));
      const body = { photos };
      for (const name of ['title','description','condition','price','contact']) body[name] = $('swap-form').elements[name].value;
      if (editing) { body.id = editing.id; body.version = editing.version; }
      await api('/listings', body);
      $('swap-editor').hidden = true; $('swap-form').reset(); retained = []; editing = null;
      scope = 'mine'; await load(); say('Submitted for approval. The listing and photos are private until an administrator approves them.');
    });
  });
  document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => task(button, async () => { if (loading) return; scope = button.dataset.scope; await load(); })));
  $('swap-search').addEventListener('submit', event => { event.preventDefault(); task(event.submitter, () => load()); });
  $('swap-more').addEventListener('click', event => task(event.target, () => load(true)));
  // Also remove expired cards from an already open page; the API is authoritative.
  setInterval(() => { if (scope === 'public') document.querySelectorAll('.swap-card').forEach(card => { if (Number(card.dataset.expires) <= Date.now()) card.remove(); }); }, 1000);
  task(null, async () => { user = (await api('/session')).user; account(); await load(); say('Browse freely. Verified members can submit equipment for review.'); });
})();
