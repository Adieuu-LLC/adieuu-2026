import { describe, expect, mock, test } from 'bun:test';
import {
  initiateCall,
  joinCall,
  leaveCall,
  endCall,
  getActiveCall,
  updateMediaState,
  updateCallSettings,
} from './callService';

function createClient() {
  return {
    post: mock(async () => ({ success: true, data: {} })),
    get: mock(async () => ({ success: true, data: {} })),
    patch: mock(async () => ({ success: true, data: {} })),
  };
}

const MEDIA = { audio: true, video: false, screenshare: false };
const CONV = 'conv/id+test';
const CALL = 'call/id test';

describe('callService', () => {
  test('initiateCall posts to encoded conversation calls path', async () => {
    const client = createClient();
    await initiateCall(client as never, CONV, MEDIA);
    expect(client.post).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls`,
      { media: MEDIA }
    );
  });

  test('joinCall posts to encoded join path', async () => {
    const client = createClient();
    await joinCall(client as never, CONV, CALL, MEDIA);
    expect(client.post).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls/${encodeURIComponent(CALL)}/join`,
      { media: MEDIA }
    );
  });

  test('leaveCall posts to encoded leave path', async () => {
    const client = createClient();
    await leaveCall(client as never, CONV, CALL);
    expect(client.post).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls/${encodeURIComponent(CALL)}/leave`
    );
  });

  test('endCall posts to encoded end path', async () => {
    const client = createClient();
    await endCall(client as never, CONV, CALL);
    expect(client.post).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls/${encodeURIComponent(CALL)}/end`
    );
  });

  test('getActiveCall gets active call path', async () => {
    const client = createClient();
    await getActiveCall(client as never, CONV);
    expect(client.get).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls/active`
    );
  });

  test('updateMediaState patches media path', async () => {
    const client = createClient();
    await updateMediaState(client as never, CONV, CALL, MEDIA);
    expect(client.patch).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/calls/${encodeURIComponent(CALL)}/media`,
      { media: MEDIA }
    );
  });

  test('updateCallSettings patches call-settings path', async () => {
    const client = createClient();
    const settings = { videoCallsDisabled: true };
    await updateCallSettings(client as never, CONV, settings);
    expect(client.patch).toHaveBeenCalledWith(
      `/api/conversations/${encodeURIComponent(CONV)}/call-settings`,
      settings
    );
  });
});
