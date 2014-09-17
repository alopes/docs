


(function() {
  var searchpage = /^\/search/;

  $('form#search').on('submit', function(ev) {
    ev.preventDefault();
    var stq = $(this).find('[name=stq]').val();

    if (searchpage.test(window.location.pathname)) {
      return setSearchHash(stq, hashParams().stp);
    };

    redirect('/search#' + createHash(stq, hashParams().stp));
  });

  $('#search-input').swiftypeSearch({
    resultContainingElement: '#search-results',
    engineKey: 'gsLKKoQYUiLHFk6x8EXU'
  });

  $('#search-input')
  .val(hashParams().stq || '')
  .on('input', function() {
    if (searchpage.test(window.location.pathname)) {
      $(this).submit();
    }
  });

  $(window).hashchange(function() {
    $('#search-input').val(hashParams().stq);
  });

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

  function queryParams () {
    return queryParser(window.location.search.substr(1).split('&'));
  };

  function hashParams () {
    return queryParser(window.location.hash.substr(1).split('&'));
  };

  function createHash (query, page) {
    return "stq=" + encodeURIComponent(query) + "&stp=" + (page || 1);
  }
  function setSearchHash (query, page) {
    window.location.hash = createHash(query, page);
  }

  function redirect (path) {
    window.location.href = window.location.origin + path;
  }

})()

