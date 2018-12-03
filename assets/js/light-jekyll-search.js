/**
 * lightJekyllSearch
 *
 * Copyright 2018, Woo YeongJun(a@hax0r.info)
 * Licensed under the MIT License.
 */

'use strict';

var lightJekyllSearch = {
    initialize : function()
    {
        this.posts = this.featchPosts(this.postJsonPath);
    },
    search : function(config)
    {
        var self = this;

        lightJekyllSearch.initialize();

        if ( config.el !== null ) {
            config.el.placeholder = ( config.placeholder ) ? config.placeholder : '';
        }

        if ( config.postJsonPath ) {
            this.postJsonPath = config.postJsonPath;
        }

        this.innerFunctions.addEvent('keyup', config.el, function(e)
        {
            if ( e.target.value.length === 0 ){
                self.disableSuggestion();
            }

            if ( document.getElementById('light-jekyll-search-suggestion') !== null ) {
                if ( document.getElementById('light-jekyll-search-suggestion').style.display === 'none' ) {
                    this.enableSuggestion();
                }
            }
            self.suggestion(config.el, self.searchFor(e.target.value, self.posts));
        });

        this.innerFunctions.addEvent('keydown', config.el, function(e)
        {
            if ( e.target.value.length === 0 ){
                self.disableSuggestion();
            }
            if ( document.getElementById('light-jekyll-search-suggestion') !== null ) {
                if ( document.getElementById('light-jekyll-search-suggestion').style.display === 'none' ) {
                    self.enableSuggestion();
                }
            }
            self.suggestion(config.el, self.searchFor(e.target.value, self.posts));
        });

        this.innerFunctions.addEvent('click', document.querySelector('html'), function(e)
        {
            if ( document.getElementById('light-jekyll-search-suggestion') !== null ) {
                self.disableSuggestion();
            }
        });
    },
    enableSuggestion : function()
    {
        document.getElementById('light-jekyll-search-suggestion').style.display = '';
    },
    disableSuggestion : function()
    {
        document.getElementById('light-jekyll-search-suggestion').style.display = 'none';
    },
    searchFor : function(toSearch, posts)
    {
        var results = [],
            toSearch = this.innerFunctions.trimString(toSearch);

        for ( var i = 0; i < posts.length; i++ ) {
            for ( var key in posts[i] ) {
                if ( posts[i][key].indexOf(toSearch)!=-1 ) {
                    if ( !this.innerFunctions.itemExists(results, posts[i]) ) {
                        results.push(posts[i]);
                    }
                }
            }
        }
        return results;
    },
    suggestion : function(el, related)
    {
        var suggestionHtml = '',
            suggestionNode = document.getElementById('light-jekyll-search-suggestion');

        if ( suggestionNode === null ) {
            suggestionHtml += '<div id="light-jekyll-search-suggestion">';
        } else {
            suggestionNode.innerHTML = ''
        }

        suggestionHtml += '<p class="found_results_n">';
        suggestionHtml += related.length.toString() + 'Result(s) found';
        suggestionHtml += '</p>';

        suggestionHtml += '<ul>';
        for ( var i = 0; i < related.length; i++ ) {
            suggestionHtml += '<li>';
            suggestionHtml += '<a href="'+ related[i].url +'">';
            suggestionHtml += related[i].title;
            suggestionHtml += '</a>';
            suggestionHtml += '</li>';
        }
        suggestionHtml += '</ul>';

        if ( suggestionNode === null ) {
            suggestionHtml += '</div>';
            el.insertAdjacentHTML('afterend', suggestionHtml);
        } else {
            suggestionNode.innerHTML = suggestionHtml;
        }
    },
    posts : new Object,
    postJsonPath : '/assets/json/posts.json',
    featchPosts : function(postJsonPath)
    {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open( "GET", postJsonPath, false );
        xmlHttp.send( null );

        return JSON.parse(xmlHttp.responseText);

    },
    innerFunctions : {
        addEvent : function (evnt, elem, func)
        {
            if (elem.addEventListener) {
                elem.addEventListener(evnt,func,false);
            } else if (elem.attachEvent) {
                elem.attachEvent("on"+evnt, func);
            } else {
                elem[evnt] = func;
            }
        },
        trimString : function(s)
        {
            var l = 0,
                r = s.length -1;

            while ( l < s.length && s[l] == ' ' ){
                l++;
            }

            while ( r > l && s[r] == ' ' ) {
                r -= 1;
            }

            return s.substring(l, r+1);
        },
        compareObjects : function(o1, o2)
        {
            var k = '';

            for ( k in o1 ) {
                if ( o1[k] != o2[k] ) {
                    return false;
                }
            }

            for ( k in o2 ) {
                if ( o1[k] != o2[k] ) {
                    return false;
                }
            }

            return true;
        },
        itemExists : function(haystack, needle)
        {
            for ( var i=0; i<haystack.length; i++ ) {
                if ( this.compareObjects(haystack[i], needle) ) {
                    return true;
                }
            }
            return false;

        }

    }
}