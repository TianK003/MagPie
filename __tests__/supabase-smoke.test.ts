// R2 gate: proves supabase-js loads and constructs under the jest/Metro
// transform + polyfill story. If a URL/structuredClone polyfill were missing on
// this Hermes/JS engine, importing or constructing the client would throw here.
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

describe('supabase-js smoke test', () => {
  it('imports createClient and constructs a client with fake creds', () => {
    const client = createClient(
      'https://example.supabase.co',
      'sb_publishable_fake_key_for_tests'
    );

    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
    expect(typeof client.auth.getSession).toBe('function');
    expect(typeof client.channel).toBe('function');
  });

  it('has a working global URL implementation (url polyfill)', () => {
    const url = new URL('https://example.supabase.co/rest/v1/campaigns?select=*');
    expect(url.host).toBe('example.supabase.co');
    expect(url.searchParams.get('select')).toBe('*');
  });
});
