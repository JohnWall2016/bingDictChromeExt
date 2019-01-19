document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('query').focus();

  const formElement = document.querySelector('#form');
  const resultElement = document.querySelector('#result');
  const loadingElement = document.querySelector('#loading');
  const { action: url, method } = formElement;

  /**
   * If the word to be translated is the same as last word, nothing happens.
   *
   * @param {Function} next
   * @returns
   */
  function withLastWordNotModified(next) {
    return word => {
      if (word !== formElement.dataset.lastWord) {
        formElement.dataset.lastWord = word;
        next(word);
      }
    };
  }

  /**
   * Show loading while translating
   *
   * @param {Function} next
   * @returns
   */
  function withLoading(next) {
    return (...args) => {
      toggle(loadingElement);
      toggle(resultElement);
      return next(...args).then(
        () => {
          toggle(loadingElement);
          toggle(resultElement);
        },
        () => {
          toggle(loadingElement);
          toggle(resultElement);
        }
      );
    };
  }

  /**
   * Generate html using extracted translation info.
   *
   * @param {any} next
   * @returns
   */
  function generateContent(next) {
    return (...args) =>
      next(...args).then(translation => {
        resultElement.innerHTML = '';
        if (translation) {
          resultElement.innerHTML = convertToHtml(translation);
        }
      });
  }

  /**
   * Cache translation history.
   *
   * @param {Function} next
   * @returns
   */
  function withCache(next) {
    const cache = new Map();
    return key => {
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      return Promise.resolve(next(key)).then(resp => {
        if (resp) cache.set(key, resp);
        return resp;
      });
    };
  }

  /**
   * Extract translation info from response html.
   *
   * @param {Function} next
   * @returns
   */
  function extractResponse(next) {
    return (...args) => {
      return next(...args).then(response => {
        const container = response.querySelector('.qdef');
        let result = null;
        if (container) {
          result = [extractBasic, extractTranslate, extractVariantForm].reduce(
            (result, current, index) =>
              Object.assign(result, current(container.children[index])),
            {}
          );
        }
        return result;
      });
    };
  }

  /**
   * Get translation from bing site.
   *
   * @param {string} word
   * @returns
   */
  function fetchTranslation(word) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'document';
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            resolve(xhr.responseXML);
          } else {
            reject(xhr.status);
          }
        }
      };
      xhr.open(method, `${url}?q=${word}`, true);
      xhr.send();
    });
  }

  function extractBasic(doc) {
    var word = doc.querySelector('#headword').innerText.trim();
    var hd_p1_1 = doc.querySelector('.hd_p1_1');
    var lang = hd_p1_1.getAttribute('lang');
    var pronounceChildren = hd_p1_1.querySelectorAll('div');
    var pronounces =
      pronounceChildren.length > 0
        ? Array.prototype.reduce
            .call(
              pronounceChildren,
              function(result, current, index) {
                if (index % 2 === 0) {
                  result.push([current]);
                } else {
                  result[result.length - 1].push(current);
                }
                return result;
              },
              []
            )
            .map(function(divs) {
              var pronounce = {
                locale: divs[0].innerText,
              };
              return pronounce;
            })
        : hd_p1_1.innerText;
    return {
      word,
      pronounces,
      lang,
    };
  }
  
  function extractTranslate(doc) {
    return {
      translates: Array.prototype.map.call(doc.querySelectorAll('li'), item => {
        return {
          pos: item.querySelector('.pos').innerText,
          def: item.querySelector('.def').innerText,
        };
      }),
    };
  }
  
  function extractVariantForm(doc) {
    const variants = doc.querySelector('.hd_div1 .hd_if');
    if (!variants) return null;
    const types = Array.prototype.map.call(
      variants.querySelectorAll('span'), span => span.innerText
    );
    const values = Array.prototype.map.call(
      variants.querySelectorAll('a'), a => a.innerText
    );
    const result = {
      variants: {
        types,
        values,
      },
    };
    return result;
  }

  function convertToHtml(translation) {
    let result = '';
    if (translation.pronounces) {
      let pronounce = ''
      if (translation.pronounces instanceof Array) {
        pronounce = translation.pronounces.map(p => p.locale).join('; ');
      } else {
        pronounce = translation.pronounces;
      }
      result += `
      <dl>
        <dd>${pronounce}</dd>
      </dl>
      `;
    }
    if (translation.translates) {
      result += `
      <dl>
        ${translation.translates
          .map(item => `<dd><strong>${item.pos}：</strong>${item.def}</dd>`)
          .join('\n')}
      </dl>
      `;
    }
    if (translation.variants) {
      result += `
      <dl>
      `;
      let i = 0;
      for (const type of translation.variants.types) {
        result += `
        <dd>${type}${translation.variants.values[i++]}</dd>
        `;
      }
      result += `
      </dl>
      `;
    }
    return result;
  }

  const submitHandler = compose(
    withLastWordNotModified,
    withLoading,
    generateContent,
    withCache,
    extractResponse
  )(fetchTranslation);

  formElement.addEventListener('submit', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const { value: query } = formElement.elements['query'];
    submitHandler(query);
  });

  formElement.elements['query'].addEventListener('input', function(e) {
    formElement.elements['submitBtn'].disabled = !e.target.value;
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    formElement.elements['query'].value = request.word;
    formElement.elements['submitBtn'].disabled = false;
    formElement.elements['submitBtn'].click();
  });
});

function compose(...fns) {
  const fnList = fns.filter(fn => typeof fn === 'function');
  if (fnList.length === 0)
    throw new Error(
      'Argument error, at least one `function` should be provided'
    );
  return fnList.reduce((f, g) => (...args) => f(g(...args)));
}

/**
 * toggle display status of html element
 * @param element html element
 */
function toggle(element) {
  const oldDisplay = element.style.display;
  element.style.display = oldDisplay === 'block' ? 'none' : 'block';
}
