(function () {
  'use strict';

  let noteIndexPromise = null;

  /**
   * ノート一覧を読み込む
   */
  function loadNoteIndex() {
    if (noteIndexPromise) {
      return noteIndexPromise;
    }

    noteIndexPromise = fetch('_note-index.json')
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            '_note-index.jsonを読み込めませんでした: ' +
              response.status
          );
        }

        return response.json();
      })
      .catch(function (error) {
        console.error('[Obsidian WikiLinks]', error);
        return {};
      });

    return noteIndexPromise;
  }

  /**
   * HTML特殊文字をエスケープする
   */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * パス表記を統一する
   */
  function normalizePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/\.md$/i, '')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .trim();
  }

  /**
   * Docsifyのルート用にパスをエンコードする
   *
   * スラッシュは残し、各フォルダ名・ファイル名だけを
   * encodeURIComponentで変換する
   */
  function encodeRoutePath(path) {
    return normalizePath(path)
      .split('/')
      .filter(function (part) {
        return part.length > 0;
      })
      .map(function (part) {
        return encodeURIComponent(part);
      })
      .join('/');
  }

  /**
   * 見出し名をDocsifyの見出しIDに近い形式へ変換する
   */
  function headingToId(heading) {
    return String(heading || '')
      .trim()
      .toLowerCase()
      .replace(
        /[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g,
        ''
      )
      .replace(/\s+/g, '-');
  }

  /**
   * ノート名から実際の保存パスを取得する
   */
  function resolveNotePath(noteName, index) {
    const normalizedName = normalizePath(noteName);

    if (!normalizedName) {
      return '';
    }

    /*
     * [[カテゴリーBOX/069_茶室/ヌルヌルについて]]
     * のようにパスが書かれている場合はそのまま使う
     */
    if (normalizedName.includes('/')) {
      return normalizedName;
    }

    const candidates = index[normalizedName];

    /*
     * インデックスに存在しない場合
     * Docsifyのルートとしてその名前をそのまま使う
     */
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.warn(
        '[Obsidian WikiLinks] ノートが見つかりません:',
        normalizedName
      );

      return normalizedName;
    }

    /*
     * 同名ノートが複数ある場合
     */
    if (candidates.length > 1) {
      console.warn(
        '[Obsidian WikiLinks] 同名ノートが複数あります:',
        normalizedName,
        candidates
      );
    }

    /*
     * パスが短いものを優先する
     */
    return candidates
      .slice()
      .sort(function (a, b) {
        const depthA = normalizePath(a).split('/').length;
        const depthB = normalizePath(b).split('/').length;

        if (depthA !== depthB) {
          return depthA - depthB;
        }

        return a.length - b.length;
      })[0];
  }

  /**
   * Wikiリンクの内容を分解する
   *
   * 対応例:
   * [[ノート名]]
   * [[ノート名|表示名]]
   * [[ノート名#見出し]]
   * [[ノート名#見出し|表示名]]
   * [[#見出し]]
   */
  function parseWikiLinkContent(content) {
    const rawContent = String(content || '').trim();

    const aliasSeparator = rawContent.indexOf('|');

    let targetPart = rawContent;
    let alias = '';

    if (aliasSeparator !== -1) {
      targetPart = rawContent.slice(0, aliasSeparator).trim();
      alias = rawContent.slice(aliasSeparator + 1).trim();
    }

    const headingSeparator = targetPart.indexOf('#');

    let noteName = targetPart;
    let heading = '';

    if (headingSeparator !== -1) {
      noteName = targetPart.slice(0, headingSeparator).trim();
      heading = targetPart
        .slice(headingSeparator + 1)
        .trim();
    }

    return {
      noteName: noteName,
      heading: heading,
      alias: alias,
    };
  }

  /**
   * 通常のWikiリンクをHTMLリンクへ変換する
   */
  function createWikiLink(content, index) {
    const parsed = parseWikiLinkContent(content);

    const noteName = parsed.noteName;
    const heading = parsed.heading;
    const alias = parsed.alias;

    /*
     * [[#見出し]]
     * 同じページ内の見出し
     */
    if (!noteName && heading) {
      const headingId = headingToId(heading);
      const displayText = alias || heading;

      return (
        '<a href="?id=' +
        encodeURIComponent(headingId) +
        '">' +
        escapeHtml(displayText) +
        '</a>'
      );
    }

    if (!noteName) {
      return '[[' + escapeHtml(content) + ']]';
    }

    const resolvedPath = resolveNotePath(noteName, index);
    const encodedPath = encodeRoutePath(resolvedPath);

    /*
     * HTMLのhrefとして直接 #/ルートを作る。
     *
     * MarkdownリンクにするとDocsifyが
     * #/?id=...へ変換する場合があるため、
     * HTMLリンクを直接出力する。
     */
    let href = '#/' + encodedPath;

    if (heading) {
      href +=
        '?id=' +
        encodeURIComponent(headingToId(heading));
    }

    let displayText = alias;

    if (!displayText) {
      if (heading) {
        displayText = noteName + ' › ' + heading;
      } else {
        displayText = noteName;
      }
    }

    return (
      '<a class="obsidian-wikilink" href="' +
      escapeHtml(href) +
      '">' +
      escapeHtml(displayText) +
      '</a>'
    );
  }

  /**
   * Obsidian画像埋め込みを変換する
   *
   * ![[画像.png]]
   * ![[画像.png|300]]
   *
   * ノートの埋め込みには対応せず、そのまま残す
   */
  function convertImageEmbeds(markdown) {
    return markdown.replace(
      /!\[\[([^\]]+)\]\]/g,
      function (original, content) {
        const parts = String(content).split('|');

        const target = parts[0].trim();
        const sizeValue =
          parts.length > 1 ? parts[1].trim() : '';

        if (
          !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(
            target
          )
        ) {
          return original;
        }

        const encodedSource = target
          .replace(/\\/g, '/')
          .split('/')
          .map(function (part) {
            return encodeURIComponent(part);
          })
          .join('/');

        let sizeAttribute = '';

        if (/^\d+$/.test(sizeValue)) {
          sizeAttribute =
            ' width="' + escapeHtml(sizeValue) + '"';
        }

        return (
          '<img src="' +
          escapeHtml(encodedSource) +
          '" alt="' +
          escapeHtml(target) +
          '"' +
          sizeAttribute +
          '>'
        );
      }
    );
  }

  /**
   * コードブロック内を変換しないように分割する
   */
  function transformOutsideCodeBlocks(
    markdown,
    transform
  ) {
    const parts = String(markdown).split(
      /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
    );

    return parts
      .map(function (part) {
        if (
          part.startsWith('```') ||
          part.startsWith('~~~')
        ) {
          return part;
        }

        return transform(part);
      })
      .join('');
  }

  /**
   * Markdown内のWikiリンクを変換する
   */
  function convertWikiLinks(markdown, index) {
    return transformOutsideCodeBlocks(
      markdown,
      function (content) {
        /*
         * 先に画像埋め込みを処理する。
         * 通常リンクの正規表現が ![[...]] を拾わないようにする。
         */
        let converted = convertImageEmbeds(content);

        converted = converted.replace(
          /(?<!!)\[\[([^\]]+)\]\]/g,
          function (original, wikiContent) {
            try {
              return createWikiLink(
                wikiContent,
                index
              );
            } catch (error) {
              console.error(
                '[Obsidian WikiLinks] 変換失敗:',
                original,
                error
              );

              return original;
            }
          }
        );

        return converted;
      }
    );
  }

  /**
   * Docsifyプラグイン本体
   */
  function obsidianWikiLinksPlugin(hook) {
    hook.beforeEach(function (markdown, next) {
      loadNoteIndex()
        .then(function (index) {
          next(convertWikiLinks(markdown, index));
        })
        .catch(function (error) {
          console.error(
            '[Obsidian WikiLinks]',
            error
          );

          /*
           * エラー時もページ表示を止めない
           */
          next(markdown);
        });
    });
  }

  window.$docsify = window.$docsify || {};

  window.$docsify.plugins = (
    window.$docsify.plugins || []
  ).concat(obsidianWikiLinksPlugin);
})();
