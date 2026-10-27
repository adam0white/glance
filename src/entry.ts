/** Pure route selection. No SDK, native storage or service-worker imports. */
export function fileEntry(search: string, pathname = '/'): 'native' | 'file' | 'invalid' {
  const values = new URLSearchParams(search).getAll('file');
  if (values.length > 1 || (values.length === 1 && values[0] !== '1')) return 'invalid';
  return values.length === 1 || pathname === '/file/' || pathname === '/file' ? 'file' : 'native';
}
