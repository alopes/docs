(function() {

  // Install Swiftype widget
  (function(w,d,t,u,n,s,e){w['SwiftypeObject']=n;w[n]=w[n]||function(){
  (w[n].q=w[n].q||[]).push(arguments);};s=d.createElement(t);
  e=d.getElementsByTagName(t)[0];s.async=1;s.src=u;e.parentNode.insertBefore(s,e);
  })(window,document,'script','//s.swiftypecdn.com/install/v1/st.js','_st');

  // Run Swiftype widget
  _st('install','XZueLo9ygDyMKse1qg6Z');

  // Update input with current query value
  $('#search-input').val(hashParams().stq || '')

  // update input at any hashchange
  // XXX: Used mostly when pushstate change of hash search
  $(window).hashchange(function() {
    $('#search-input').val(hashParams().stq);
  });

  // Private helper functions
  function queryParser (a) {
    var i, p, b = {};
    if (a === "") {
      return {};
    }
    for (i = 0; i < a.length; i += 1) {
      p = a[i].split('=');
      if (p.length === 2) {
        b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
      }
    }
    return b;
  };

  function hashParams () {
    return queryParser(window.location.hash.substr(1).split('&'));
  };

})()

