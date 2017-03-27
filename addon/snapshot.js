import Ember from 'ember';
import wait from 'ember-test-helpers/wait';
import config from 'ember-get-config';
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

function takeSnapshot(name, options) {
  let snapshotHtml;
  const scope = options.scope;

  // Create a full-page DOM snapshot from the current testing page.
  // TODO(fotinakis): more memory-efficient way to do this?
  const domCopy = Ember.$('html').clone();
  const testingContainer = domCopy.find('#ember-testing');

  if (scope) {
    snapshotHtml = testingContainer.find(scope).html();
  } else {
    snapshotHtml = testingContainer.html();
  }

  // Hoist the testing container contents up to the body.
  // We need to use the original DOM to keep the head stylesheet around.
  domCopy.find('body').html(snapshotHtml);

  return Ember.run(function() {
    maybeDisableMockjax();
    const requestPromise = Ember.$.ajax('/_percy/snapshot', {
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

    return requestPromise;
  });
}

function sequence(items, callback) {
  return items.reduce((promised, item) => {
    function run() {
      return callback(item);
    }

    if(promised) {
      return Ember.RSVP.Promise.resolve(promised).then(run);
    }

    return run();
  }, null);
}

function takeSnapshotAtEachBreakpoint(name, options) {
  const breakpointNames = options.breakpoints || (config.percy && config.percy.defaultBreakpoints);
  const breakpoints = (config.percy && config.percy.breakpointsConfig) || {};
  const optionsCopy = Ember.copy(options, true);

  return sequence(breakpointNames, (breakpointName) => {
    const breakpoint = breakpoints[breakpointName];

    if(!breakpoint) {
      Ember.warn(
        `Unrecognised breakpoint name specified (${breakpointName})`,
        false,
        { id: 'ember-percy.client-scaling.invalid-breakpoint' }
      );
      return;
    }

    // TODO: Scale the testing container, wait for Ember to stabilise, then take a snapshot
    const testingContainer = Ember.$('#ember-testing');
    const originalTestingWidth = testingContainer.width();
    const $window = Ember.$(window);
    testingContainer.width(breakpoint);
    $window.trigger('resize');

    // Customise the options to specify a single breakpoint for this snapshot
    optionsCopy.breakpoints = [breakpointName];

    return wait()
      .then(() => takeSnapshot(
        `${name} (${breakpointName})`,
        optionsCopy
      )
    ).then(() => {
      // Restore widths
      testingContainer.width(originalTestingWidth);
    });
  });
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

  options = options || {};

  if(options.clientScaling) {
    return takeSnapshotAtEachBreakpoint(name, options);
  }

  return takeSnapshot(name, options);
}
