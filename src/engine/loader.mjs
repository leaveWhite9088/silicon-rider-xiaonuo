export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (e) {
    if ((e.code === 'ERR_MODULE_NOT_FOUND') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
      try { return await nextResolve(specifier + '.js', context); } catch { /* fallthrough */ }
      try { return await nextResolve(specifier + '/index.js', context); } catch { /* fallthrough */ }
    }
    throw e;
  }
}
