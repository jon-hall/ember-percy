import Ember from 'ember';
import { percySnapshot } from 'ember-percy';

Ember.Test.registerAsyncHelper('percySnapshot', function(app, name, options) {
  return percySnapshot(name, options);
});
