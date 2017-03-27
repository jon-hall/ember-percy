import Ember from 'ember';

export default Ember.Component.extend({
  classNames: ['DummyBox'],

  width: null,

  recalculateWidth() {
    Ember.run(() => {
      return new Ember.RSVP.Promise((resolve) => {
        this.set('width', Ember.$(Ember.testing ? '#ember-testing' : window).width());
        resolve();
      });
    });
  },

  didInsertElement(...args) {
    this._super(...args);

    this._resizeHandler = () => this.recalculateWidth();
    Ember.$(window).on('resize', this._resizeHandler);
  },

  willDestroyElement() {
    Ember.$(window).off('resize', this._resizeHandler);
  }
});
