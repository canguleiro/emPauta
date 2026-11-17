import {
  createAccountRootIdentity, createDeviceIdentity, createPairingOffer,
  acceptPairingOffer, completePairingHost, finishPairingClient,
  verifyDeviceCertificate
} from './device-pairing.js';
import {
  createPairingSession, watchPairingSession, publishPairingRequest,
  publishPairingResponse, publishDeviceCertificate, pinAccountRoot,
  cancelPairingSession,
  readPinnedAccountRoot
} from './device-pairing-store.js';
import {
  saveAccountRoot, saveAccountRootPublic, loadAccountRoot, saveLocalDevice, loadLocalDevice,
  listLocalDevices
} from './device-pairing-vault.js';
import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { assertDeviceRevocationAllowed } from './device-revocation-policy.js';
import { qrSvg } from './vendor/qrcode-render.js';

const $ = id => document.getElementById(id);
const ROOM = 'private-room';
let activeHost = null;
let activeClientUnsub = null;
let cameraStream = null;
let cameraFrame = null;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function show(id) { $(id)?.classList.remove('hidden'); }
function hide(id) { $(id)?.classList.add('hidden'); }
function stopCamera() {
  if (cameraFrame) cancelAnimationFrame(cameraFrame);
  cameraFrame = null;
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  const video = $('pairingVideo');
  if (video) video.srcObject = null;
}
function gateMessage(message, error = false) {
  setText('pairingGateStatus', message);
  const el = $('pairingGateStatus');
  if (el) el.classList.toggle('error-text', error);
}
function hostMessage(message, error = false) {
  setText('pairingHostStatus', message);
  const el = $('pairingHostStatus');
  if (el) el.classList.toggle('error-text', error);
}
function parseOfferPayload(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (value?.type !== 'criart-pairing' || !value.offer) throw new Error('Este QR Code não é um convite válido do CrIArt.');
  return value.offer;
}

async function listDevices(db, uid, rootPublicKeyJwk) {
  const local = await listLocalDevices(uid);
  const snap = await getDocs(collection(db, 'private', ROOM, 'devices', uid, 'items'));
  const remote = [];
  const authorized = [];
  for (const item of snap.docs) {
    const data = item.data();
    const cert = data.certificate;
    const valid = data.ownerUid === uid && data.deviceId === item.id &&
      data.state === 'active' && cert?.deviceId === item.id &&
      await verifyDeviceCertificate(cert, uid, rootPublicKeyJwk);
    const entry = {
      uid, deviceId: item.id, valid, state: data.state,
      certificate: cert || null,
      createdAtMs: data.createdAtMs || cert?.createdAt || 0
    };
    remote.push(entry);
    if (valid) authorized.push({ uid, deviceId: item.id, certificate: cert });
  }
  return { local, remote, authorized };
}

/**
 * Carrega o contexto criptográfico V3 deste aparelho sem alterar chaves.
 * Só certificados ativos e assinados pela raiz fixada entram em authorizedDevices.
 */
/** Recupera somente a chave pública raiz fixada; útil para validar certificados históricos. */
export async function loadPinnedDeviceRoot(db, uid) {
  const rootPublicKeyJwk = await readPinnedAccountRoot(db, uid);
  if (!rootPublicKeyJwk) throw new Error(`A conta ${uid} ainda não possui identidade raiz fixada.`);
  return rootPublicKeyJwk;
}

/** Lista dispositivos ativos de uma conta e valida cada certificado contra a raiz fixada. */
export async function loadAuthorizedDeviceInventory(db, uid) {
  const rootPublicKeyJwk = await readPinnedAccountRoot(db, uid);
  if (!rootPublicKeyJwk) throw new Error(`A conta ${uid} ainda não possui identidade raiz fixada.`);
  const inventory = await listDevices(db, uid, rootPublicKeyJwk);
  if (!inventory.authorized.length) throw new Error(`A conta ${uid} não possui dispositivos autorizados válidos.`);
  return { rootPublicKeyJwk, ...inventory };
}

export async function loadDeviceCryptoContext(db, uid, deviceId) {
  const root = await loadAccountRoot(uid);
  const pinnedRoot = await readPinnedAccountRoot(db, uid);
  if (!root?.publicKeyJwk || !pinnedRoot || canonical(root.publicKeyJwk) !== canonical(pinnedRoot)) {
    throw new Error('Identidade raiz local ausente ou divergente da raiz fixada.');
  }
  const local = await loadLocalDevice(uid, deviceId);
  if (!local || local.certificate?.uid !== uid || local.certificate?.deviceId !== deviceId ||
      !(await verifyDeviceCertificate(local.certificate, uid, pinnedRoot))) {
    throw new Error('Identidade criptográfica local não validada.');
  }
  const inventory = await listDevices(db, uid, pinnedRoot);
  const own = inventory.authorized.find(item => item.deviceId === deviceId);
  if (!own) throw new Error('Este dispositivo não consta como ativo no inventário autorizado.');
  return {
    localDevice: { uid, deviceId, privateKey: local.privateKey, certificate: local.certificate },
    rootPublicKeyJwk: pinnedRoot,
    authorizedDevices: inventory.authorized,
    inventory
  };
}

/** Revoga um aparelho remoto em transação, sem permitir revogar o atual ou o último ativo. */
export async function revokeAuthorizedDevice(db, uid, currentDeviceId, targetDeviceId) {
  if (!uid || !currentDeviceId || !targetDeviceId) throw new Error('Dados de revogação incompletos.');
  const devicesRef = collection(db, 'private', ROOM, 'devices', uid, 'items');
  const targetRef = doc(db, 'private', ROOM, 'devices', uid, 'items', targetDeviceId);
  await runTransaction(db, async transaction => {
    const [allDevices, targetSnap] = await Promise.all([
      transaction.get(devicesRef),
      transaction.get(targetRef)
    ]);
    const activeIds = allDevices.docs
      .filter(item => item.data()?.ownerUid === uid && item.data()?.state === 'active')
      .map(item => item.id);
    assertDeviceRevocationAllowed({ activeDeviceIds: activeIds, currentDeviceId, targetDeviceId });
    if (!targetSnap.exists() || targetSnap.data()?.ownerUid !== uid || targetSnap.data()?.state !== 'active') {
      throw new Error('O dispositivo selecionado não está ativo ou não pertence a esta conta.');
    }
    transaction.update(targetRef, {
      state: 'revoked',
      revokedAt: serverTimestamp(),
      revokedAtMs: Date.now()
    });
  });
  return true;
}

function renderDeviceList(target, devices, currentDeviceId = '', onRevoke = null) {
  if (!target) return;
  target.replaceChildren();
  if (!devices.length) {
    const p = document.createElement('p');
    p.className = 'tiny';
    p.textContent = 'Nenhum dispositivo certificado encontrado.';
    target.append(p);
    return;
  }
  for (const device of devices) {
    const row = document.createElement('div');
    row.className = 'device-row';
    const info = document.createElement('div');
    info.className = 'device-row-info';
    const title = document.createElement('strong');
    title.textContent = device.deviceId === currentDeviceId ? 'Este dispositivo' : `Dispositivo ${device.deviceId.slice(0, 8)}`;
    const detail = document.createElement('span');
    const status = device.state === 'revoked' ? 'Revogado' : device.valid === false ? 'Certificado inválido' : 'Ativo';
    detail.textContent = `${status} · ${new Date(device.createdAtMs || Date.now()).toLocaleDateString('pt-BR')}`;
    info.append(title, detail);
    row.append(info);
    if (device.deviceId !== currentDeviceId && device.state === 'active' && device.valid !== false && onRevoke) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'device-revoke-btn';
      button.textContent = 'Revogar';
      button.addEventListener('click', () => onRevoke(device));
      row.append(button);
    }
    target.append(row);
  }
}

async function initializeTrustedHost(db, uid, nickname) {
  let root = await loadAccountRoot(uid);
  const remoteRoot = await readPinnedAccountRoot(db, uid);
  if (!root && remoteRoot) {
    throw new Error('A identidade raiz já está fixada no Firestore, mas não existe neste dispositivo. Não será substituída. Use um aparelho já vinculado.');
  }
  if (!root) {
    const identity = await createAccountRootIdentity();
    await saveAccountRoot(uid, identity);
    try {
      await pinAccountRoot(db, uid, identity.publicKeyJwk);
    } catch (error) {
      throw new Error(`Não foi possível fixar a identidade raiz com segurança: ${error.message}`);
    }
    root = await loadAccountRoot(uid);
  } else if (!remoteRoot) {
    // Recuperação segura: somente o aparelho que ainda possui a chave
    // legada original pode concluir a primeira fixação da raiz local.
    await pinAccountRoot(db, uid, root.publicKeyJwk);
  } else if (canonical(root.publicKeyJwk) !== canonical(remoteRoot)) {
    throw new Error('A identidade raiz local diverge da chave fixada no Firestore. Pareamento bloqueado.');
  }
  if (!root?.privateKey) {
    throw new Error('Este aparelho possui apenas a chave pública raiz. Somente o dispositivo de autoridade pode autorizar novos pareamentos.');
  }

  const local = await listLocalDevices(uid);
  if (!local.length) {
    const device = await createDeviceIdentity(uid, root.privateKey);
    await saveLocalDevice(uid, device);
    await publishDeviceCertificate(db, uid, device.certificate);
  } else {
    const own = local[0];
    const valid = await verifyDeviceCertificate(own.certificate, uid, root.publicKeyJwk);
    if (!valid) throw new Error('O certificado local deste dispositivo não é válido.');
    await publishDeviceCertificate(db, uid, own.certificate);
  }
  return { root, devices: await listDevices(db, uid, root.publicKeyJwk) };
}

async function beginHostPairing(db, uid) {
  if (activeHost?.unsubscribe) {
    const previous = activeHost;
    previous.unsubscribe();
    await cancelPairingSession(db, uid, previous.offerState.offer.sessionId).catch(() => {});
  }
  const root = await loadAccountRoot(uid);
  if (!root) throw new Error('Identidade raiz local não encontrada neste aparelho.');
  const { offer, privateKey } = await createPairingOffer(uid, root.publicKeyJwk, 180000);
  await createPairingSession(db, uid, offer);
  const payload = JSON.stringify({ type: 'criart-pairing', offer });
  const qr = $('pairingQr');
  if (qr) qr.innerHTML = qrSvg(payload, 280);
  setText('pairingSessionExpiry', `Válido por 3 minutos · ${new Date(offer.expiresAt).toLocaleTimeString('pt-BR')}`);
  show('pairingHostActive');
  hostMessage('Aguardando a leitura do QR Code pelo novo aparelho…');
  activeHost = { offerState: { offer, privateKey }, uid, db, handling: false, unsubscribe: null };
  activeHost.unsubscribe = watchPairingSession(db, uid, offer.sessionId, async data => {
    if (!data) return;
    if (data.request && !activeHost.handling && !data.response) {
      activeHost.handling = true;
      try {
        const result = await completePairingHost(activeHost.offerState, data.request, root);
        activeHost.result = result;
        setText('pairingHostCode', result.verificationCode);
        show('pairingHostConfirm');
        hostMessage('Compare o código de seis dígitos com o exibido no novo aparelho. Só prossiga se forem idênticos.');
      } catch (error) {
        hostMessage(error.message, true);
        activeHost.handling = false;
      }
    }
    if (data.response) hostMessage('Resposta enviada. Finalizando o vínculo no novo aparelho…');
  }, error => hostMessage(error.message, true));
}

async function confirmHostPairing() {
  if (!activeHost?.result) return;
  const confirm = $('pairingHostMatch');
  if (!confirm?.checked) {
    hostMessage('Confirme que os códigos são idênticos antes de continuar.', true);
    return;
  }
  try {
    await publishPairingResponse(activeHost.db, activeHost.uid, activeHost.offerState.offer.sessionId, activeHost.result.response);
    const cert = activeHost.result.response.certificate;
    await publishDeviceCertificate(activeHost.db, activeHost.uid, cert);
    const root = await loadAccountRoot(activeHost.uid);
    const refreshed = await listDevices(activeHost.db, activeHost.uid, root.publicKeyJwk);
    renderDeviceList($('pairingDeviceList'), refreshed.remote, refreshed.local[0]?.deviceId || '');
    hostMessage('Novo dispositivo vinculado. A sincronização das mensagens será habilitada em uma etapa posterior.');
    hide('pairingHostConfirm');
    activeHost.unsubscribe?.();
    activeHost = null;
  } catch (error) {
    hostMessage(error.message, true);
  }
}

async function startCamera(onOffer) {
  if (!('BarcodeDetector' in window)) throw new Error('Este navegador não oferece leitura de QR Code pela câmera. Cole o conteúdo do convite no campo abaixo.');
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  const video = $('pairingVideo');
  video.srcObject = cameraStream;
  await video.play();
  show('pairingCameraWrap');
  const scan = async () => {
    if (!cameraStream || !video.videoWidth) {
      cameraFrame = requestAnimationFrame(scan);
      return;
    }
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        stopCamera();
        onOffer(codes[0].rawValue);
        return;
      }
    } catch {}
    cameraFrame = requestAnimationFrame(scan);
  };
  cameraFrame = requestAnimationFrame(scan);
}

async function joinWithOffer(db, uid, raw) {
  stopCamera();
  const offer = parseOfferPayload(raw);
  const pinned = await readPinnedAccountRoot(db, uid);
  if (!pinned || canonical(pinned) !== canonical(offer.rootPublicKeyJwk)) {
    throw new Error('A identidade do QR Code não corresponde à chave raiz fixada para esta conta.');
  }
  const accepted = await acceptPairingOffer(offer, uid);
  await publishPairingRequest(db, uid, offer.sessionId, accepted.request);
  gateMessage('Solicitação enviada. Confira se o código abaixo coincide com o código mostrado no aparelho que está autorizando.');
  setText('pairingClientCode', accepted.verificationCode);
  show('pairingClientWaiting');
  activeClientUnsub?.();
  activeClientUnsub = watchPairingSession(db, uid, offer.sessionId, async data => {
    if (!data?.response) return;
    setText('pairingClientCode', accepted.verificationCode);
    show('pairingClientConfirm');
    gateMessage('O aparelho autorizado respondeu. Digite o código que aparece nele.');
    $('pairingClientFinish').onclick = async () => {
      try {
        const typed = $('pairingClientHostCode').value.trim();
        const completed = await finishPairingClient(accepted.context, data.response, typed);
        // Aparelho vinculado recebe apenas a chave pública raiz.
        // A chave privada de autoridade permanece no aparelho que autorizou.
        await saveAccountRootPublic(uid, completed.rootPublicKeyJwk);
        const device = { deviceId: completed.certificate.deviceId, privateKey: completed.devicePrivateKey, certificate: completed.certificate };
        await saveLocalDevice(uid, device);
        // O aparelho autorizador publica o certificado após confirmar
        // o código; o novo aparelho não tenta sobrescrever esse registro.
        activeClientUnsub?.();
        activeClientUnsub = null;
        hide('pairingClientConfirm');
        hide('pairingClientWaiting');
        hide('pairingClientForm');
        gateMessage('Dispositivo vinculado com sucesso. A etapa de sincronização multi-dispositivo das mensagens ainda está em desenvolvimento. Este aparelho permanecerá bloqueado para proteger a conversa atual.');
        show('pairingClientDone');
      } catch (error) {
        gateMessage(error.message, true);
      }
    };
  }, error => gateMessage(error.message, true));
}

export async function prepareDeviceAccess({ db, uid, hasLegacyIdentity, nickname }) {
  if (hasLegacyIdentity) {
    const result = await initializeTrustedHost(db, uid, nickname);
    mountHostPanel(db, uid, result.root, result.devices);
    const own = result.devices.local[0];
    const cryptoContext = own
      ? await loadDeviceCryptoContext(db, uid, own.deviceId)
      : null;
    return { mode: 'legacy-host', ready: true, cryptoContext };
  }
  const root = await readPinnedAccountRoot(db, uid);
  if (!root) {
    show('devicePairingGate');
    gateMessage('Este aparelho não possui a identidade criptográfica original. Para evitar substituir chaves e perder acesso ao histórico, ele não poderá inicializar uma nova identidade. Entre em contato usando um aparelho original.');
    hide('pairingClientForm');
    return { mode: 'blocked-untrusted', ready: false };
  }
  const localRoot = await loadAccountRoot(uid);
  const localDevices = await listLocalDevices(uid);
  // Aparelhos vinculados pelo protocolo público-only não recebem a chave
  // privada de autoridade. Eles podem usar V3, mas não emitir certificados.
  if (localRoot?.publicKeyJwk && !localRoot.privateKey && localDevices.length === 1) {
    const own = localDevices[0];
    try {
      const cryptoContext = await loadDeviceCryptoContext(db, uid, own.deviceId);
      hide('devicePairingGate');
      return { mode: 'linked-device', ready: true, cryptoContext };
    } catch (error) {
      show('devicePairingGate');
      gateMessage(`O vínculo local não pôde ser validado: ${error.message}`, true);
      hide('pairingClientForm');
      return { mode: 'paired-invalid', ready: false };
    }
  }
  if (localRoot || localDevices.length) {
    show('devicePairingGate');
    gateMessage('Este aparelho já iniciou ou concluiu um vínculo, mas não possui uma autoridade de assinatura válida. O acesso foi bloqueado para preservar as chaves locais; não tente refazer o pareamento nem limpar os dados do navegador.');
    hide('pairingClientForm');
    return { mode: 'paired-pending', ready: false };
  }
  show('devicePairingGate');
  hide('pairingClientDone');
  show('pairingClientForm');
  gateMessage('Vincule este aparelho usando um dispositivo que já tenha acesso à conversa.');
  $('pairingScanBtn').onclick = async () => {
    try { await startCamera(raw => joinWithOffer(db, uid, raw).catch(e => gateMessage(e.message, true))); }
    catch (error) { gateMessage(error.message, true); }
  };
  $('pairingPasteBtn').onclick = () => {
    try { joinWithOffer(db, uid, $('pairingOfferText').value).catch(e => gateMessage(e.message, true)); }
    catch (error) { gateMessage(error.message, true); }
  };
  $('pairingCancelBtn').onclick = async () => {
    stopCamera();
    activeClientUnsub?.();
    activeClientUnsub = null;
    await window.__criartSignOut?.();
  };
  return { mode: 'needs-pairing', ready: false };
}

function mountHostPanel(db, uid, root, devices) {
  const panel = $('deviceManagementPanel');
  if (!panel) return;
  show('deviceManagementPanel');
  const currentDeviceId = devices.local[0]?.deviceId || '';
  const refreshDevices = async () => {
    const rootPublicKeyJwk = await readPinnedAccountRoot(db, uid);
    const refreshed = await listDevices(db, uid, rootPublicKeyJwk);
    renderDeviceList($('pairingDeviceList'), refreshed.remote, currentDeviceId, async device => {
      if (!window.confirm('Revogar este aparelho? Ele deixará de receber novas mensagens e anexos. O acesso pode permanecer ativo até a sessão atual ser encerrada ou revalidada.')) return;
      try {
        await revokeAuthorizedDevice(db, uid, currentDeviceId, device.deviceId);
        hostMessage('Dispositivo revogado.');
        await refreshDevices();
      } catch (error) {
        hostMessage(error.message, true);
      }
    });
  };
  renderDeviceList($('pairingDeviceList'), devices.remote, currentDeviceId, async device => {
    if (!window.confirm('Revogar este aparelho? Ele deixará de receber novas mensagens e anexos. O acesso pode permanecer ativo até a sessão atual ser encerrada ou revalidada.')) return;
    try {
      await revokeAuthorizedDevice(db, uid, currentDeviceId, device.deviceId);
      hostMessage('Dispositivo revogado.');
      await refreshDevices();
    } catch (error) {
      hostMessage(error.message, true);
    }
  });
  const button = $('pairingStartBtn');
  if (button && !button.dataset.bound) {
    button.dataset.bound = '1';
    button.addEventListener('click', () => beginHostPairing(db, uid).catch(e => hostMessage(e.message, true)));
  }
  const confirm = $('pairingHostConfirmBtn');
  if (confirm && !confirm.dataset.bound) {
    confirm.dataset.bound = '1';
    confirm.addEventListener('click', confirmHostPairing);
  }
  const cancel = $('pairingHostCancelBtn');
  if (cancel && !cancel.dataset.bound) {
    cancel.dataset.bound = '1';
    cancel.addEventListener('click', () => {
      const current = activeHost;
      current?.unsubscribe?.();
      if (current) {
        cancelPairingSession(current.db, current.uid, current.offerState.offer.sessionId).catch(() => {});
      }
      activeHost = null;
      hide('pairingHostActive');
      hide('pairingHostConfirm');
      hostMessage('Pareamento cancelado.');
    });
  }
}
