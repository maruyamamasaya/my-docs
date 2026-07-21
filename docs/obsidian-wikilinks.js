(function () {
  let noteIndexPromise;

  function loadNoteIndex() {
    if (!noteIndexPromise) {
      noteIndexPromise = fetch('_note-index.json')
        .then(function (response) {
          if (!response.ok) {
            throw new Error('_note-index.jsonを読み込めません');
          }

          return response.json();
        })
        .catch(function (error) {
          console.error('[WikiLinks]', error);
          return {};
        });
    }

    return noteIndexPromise;
  }

  function normalizePath(value) {
    return value
      .replace(/\\/g, '/')
      .replace(/\.md$/i, '')
      .replace(/^\/+/, '')
      .trim();
  }

  function encodePath(path) {
    return path
      .split('/')
      .map(function (part) {
        return encodeURIComponent(part);
      })
      .join('/');
  }

  function resolveNotePath(noteName, index) {
    const normalizedName = normalizePath(noteName);

    // [[フォルダ/ノート名]]の場合
    if (normalizedName.includes('/')) {
      return normalizedName;
    }

    const candidates = index[normalizedName];

    // 一覧にない場合も、同一階層のノートとしてリンクを作る
    if (!candidates || candidates.length === 0) {
      console.warn('[WikiLinks] ノートが見つかりません:', normalizedName);
      return normalizedName;
    }

    if (candidates.length > 1) {
      console.warn(
        '[WikiLinks] 同名ノートが複数あります:',
        normalizedName,
        candidates
      );
    }

    return candidates
      .slice()
      .sort(function (a, b) {
        return a.length - b.length;
      })[0];
  }

  function convertWikiLinks(markdown, index) {
    return markdown.replace(
      /(?<!!)\[\[([^\]]+)\]\]/g,
      function (original, content) {
        const parts = content.split('|');
        const targetPart = parts[0].trim();
        const alias = parts.length > 1
          ? parts.slice(1).join('|').trim()
          : '';

        const headingParts = targetPart.split('#');
        const noteName = headingParts[0].trim();
        const heading = headingParts.length > 1
          ? headingParts.slice(1).join('#').trim()
          : '';

        // [[#見出し]]
        if (!noteName && heading) {
          const displayText = alias || heading;

          return (
            '[' +
            displayText +
            '](?id=' +
            encodeURIComponent(heading) +
            ')'
          );
        }

        if (!noteName) {
          return original;
        }

        const resolvedPath = resolveNotePath(noteName, index);
        let destination = '#/' + encodePath(resolvedPath);

        if (heading) {
          destination += '?id=' + encodeURIComponent(heading);
        }

        const displayText = alias || noteName;

        return '[' + displayText + '](' + destination + ')';
      }
    );
  }

  function obsidianWikiLinksPlugin(hook) {
    hook.beforeEach(function (markdown, next) {
      loadNoteIndex().then(function (index) {
        next(convertWikiLinks(markdown, index));
      });
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins =
    (window.$docsify.plugins || []).concat(obsidianWikiLinksPlugin);
})();
