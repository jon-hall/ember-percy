import Ember from 'ember';
import { getNativeXhr } from './native-xhr';
import { maybeDisableMockjax, maybeResetMockjax } from './mockjax-wrapper';

function getDoctype() {
  let doctypeNode = document.doctype;
  if (!doctypeNode || !doctypeNode.name) {
    return '<!DOCTYPE html>';
  }
  let doctype = "<!DOCTYPE " +
    doctypeNode.name +
    (doctypeNode.publicId ? ' PUBLIC "' + doctypeNode.publicId + '"' : '') +
    (!doctypeNode.publicId && doctypeNode.systemId ? ' SYSTEM' : '') +
    (doctypeNode.systemId ? ' "' + doctypeNode.systemId + '"' : '') +
    '>';
  return doctype;
}

// Set the property value into the attribute value for snapshotting inputs
function setAttributeValues(dom) {
  // Limit scope to inputs only as textareas do not retain their value when cloned
  let elems = dom.find('input[type=text], input[type=checkbox], input[type=radio]');

  Ember.$(elems).each(function() {
    let elem = Ember.$(this);
    switch(elem.attr('type')) {
      case 'checkbox':
      case 'radio':
        if (elem.is(':checked')) {
          elem.attr('checked', '');
        }
        break;
      default:
        elem.attr('value', elem.val());
    }
  });

  return dom;
}

// `Ember.TextArea` sets its content by updating `value` directly, this results in the `textarea`
// having empty `textContent` once cloned; additionally, the `value` is also lost during cloning in
// some browsers.
// These issues are solved by extracting the `value`s from the original, marking them with a temp
// class, then pushing the `value`s into the clone by setting `textContent` (using the temp class
// names to map between the original and clone).
const TEXTAREA_MAPPING_CLASS_PREFIX = '__temp__percy-textarea-';
let textareaIndex = 0;
function markTextareasAndGetValues(dom) {
  const values = {};

  dom.find('textarea').each(function() {
    const textarea = Ember.$(this);
    const textareaClass = `${TEXTAREA_MAPPING_CLASS_PREFIX}${textareaIndex++}`;

    values[textareaClass] = textarea.val();
    textarea.addClass(textareaClass);
  });

  return values;
}

function fixTextareas(dom, valuesMap) {
  for(let textareaClass in valuesMap) {
    if(!valuesMap.hasOwnProperty(textareaClass)) {
      continue;
    }

    const value = valuesMap[textareaClass];
    dom
      .find(`.${textareaClass}`)
      .removeClass(textareaClass)
      .text(value);
  }

  return dom;
}

function unmarkTextareas(dom, valuesMap) {
  for(let textareaClass in valuesMap) {
    if(!valuesMap.hasOwnProperty(textareaClass)) {
      continue;
    }

    dom
      .find(`.${textareaClass}`)
      .removeClass(textareaClass);
  }

  return dom;
}

export function percySnapshot(name, options) {
  // Skip if Testem is not available (we're probably running from `ember server` and Percy is not
  // enabled anyway).
  if (!window.Testem) {
    return;
  }

  // Automatic name generation for QUnit tests by passing in the `assert` object.
  if (name.test && name.test.module && name.test.module.name && name.test.testName) {
    name = `${name.test.module.name} | ${name.test.testName}`;
  } else if (name.fullTitle) {
    // Automatic name generation for Mocha tests by passing in the `this.test` object.
    name = name.fullTitle();
  }

  let snapshotRoot;
  options = options || {};
  let scope = options.scope;

  const domOriginal = Ember.$('html');
  const textareaValues = markTextareasAndGetValues(domOriginal);

  // Create a full-page DOM snapshot from the current testing page.
  // TODO(fotinakis): more memory-efficient way to do this?
  let domCopy = domOriginal.clone();

  unmarkTextareas(domOriginal, textareaValues);

  let testingContainer = domCopy.find('#ember-testing');

  if (scope) {
    snapshotRoot = testingContainer.find(scope);
  } else {
    snapshotRoot = testingContainer;
  }

  snapshotRoot = setAttributeValues(snapshotRoot);
  snapshotRoot = fixTextareas(snapshotRoot, textareaValues);

  let snapshotHtml = snapshotRoot.html();

  // Hoist the testing container contents up to the body.
  // We need to use the original DOM to keep the head stylesheet around.
  domCopy.find('body').html(snapshotHtml);

  Ember.run(function() {
    maybeDisableMockjax();
    Ember.$.ajax('/_percy/snapshot', {
      xhr: getNativeXhr,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify({
        name: name,
        content: getDoctype() + domCopy[0].outerHTML,
        widths: options.widths,
        breakpoints: options.breakpoints,
        enableJavaScript: options.enableJavaScript,
      }),
      statusCode: {
        400: function(jqXHR) {
          // Bubble up 400 errors, ie. when given options are invalid.
          throw jqXHR.responseText;
        },
      }
    });
    maybeResetMockjax();
  });
}
