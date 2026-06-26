// 注入 godfat 頁；回應 popup 查詢，回傳當前種子參數與卡池清單
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GET_GODFAT_CONTEXT') return;
  (async () => {
    const godfat = await import(chrome.runtime.getURL('lib/godfat.js'));
    const parser = await import(chrome.runtime.getURL('lib/parser.js'));
    sendResponse({
      seedParams: godfat.parseSeedParamsFromUrl(location.href),
      events: parser.parseEventList(document),
    });
  })();
  return true; // 非同步回應
});
