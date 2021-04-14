/*       F O R M S
 *
 *      A Vanilla Dom implementation of the form language
 */
/* eslint-disable multiline-ternary */

/* global alert */

import * as buttons from './buttons'
import { fieldParams } from './forms/fieldParams'
import { field, mostSpecificClassURI, fieldFunction } from './forms/fieldFunction'
import * as debug from '../debug'
import { errorMessageBlock } from './error'
import { basicField } from './forms/basic'
import { autocompleteField } from './forms/autocomplete/autocompleteField'
import * as style from '../style'

import { icons } from '../iconBase'
import * as log from '../log'
import ns from '../ns'
import * as $rdf from 'rdflib'
import { store } from '../logic'
import * as utils from '../utils'
import widgets from '../widgets' // Note default export

export const forms = {} // 20210412b

forms.field = field // Form field functions by URI of field type.

// const UI = {icons, log, ns, store, style, widgets}

const checkMarkCharacter = '\u2713'
const cancelCharacter = '\u2715'
const dashCharacter = '-'
const kb = store

forms.field[ns.ui('AutocompleteField').uri] = autocompleteField

// ///////////////////////////////////////////////////////////////////////

/*                                  Form Field implementations
 **
 */
/**          Group of different fields
 **
 **  One type of form field is an ordered Group of other fields.
 **  A Form is actually just the same as a group.
 **
 ** @param {Document} dom The HTML Document object aka Document Object Model
 ** @param {Element?} container  If present, the created widget will be appended to this
 ** @param {Map} already A hash table of (form, subject) kept to prevent recursive forms looping
 ** @param {Node} subject The thing about which the form displays/edits data
 ** @param {Node} form The form or field to be rendered
 ** @param {Node} dataDoc The web document in which the data is
 ** @param {function(ok, errorMessage)} callbackFunction Called when data is changed?
 **
 ** @returns {Element} The HTML widget created
 */
forms.field[ns.ui('Form').uri] = forms.field[ns.ui('Group').uri] =
    function (dom, container, already, subject, form, dataDoc, callbackFunction) {
      const box = dom.createElement('div')
      box.setAttribute('style', `padding-left: 2em; border: 0.05em solid ${style.formBorderColor};`) // Indent a group
      const ui = ns.ui // 20210411
      if (container) container.appendChild(box)

      // Prevent loops
      const key = subject.toNT() + '|' + form.toNT()
      if (already[key]) {
        // been there done that
        box.appendChild(dom.createTextNode('Group: see above ' + key))
        const plist = [$rdf.st(subject, ns.owl('sameAs'), subject)] // @@ need prev subject
        dom.outlineManager.appendPropertyTRs(box, plist)
        return box
      }
      // box.appendChild(dom.createTextNode('Group: first time, key: '+key))
      const already2 = {}
      for (const x in already) already2[x] = 1
      already2[key] = 1
      const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know
      let parts = kb.any(form, ui('parts'), null, formDoc)
      let p2
      if (parts) {
        p2 = parts.elements
      } else {
        parts = kb.each(form, ui('part'), null, formDoc) //  Warning: unordered
        p2 = forms.sortBySequence(parts)
      }
      if (!parts) {
        box.appendChild(errorMessageBlock(dom, 'No parts to form! '))
        return dom
      }
      const eles = []
      const original = []
      for (let i = 0; i < p2.length; i++) {
        const field = p2[i]
        const t = mostSpecificClassURI(field) // Field type
        if (t === ui('Options').uri) {
          const dep = kb.any(field, ui('dependingOn'), null, formDoc)
          if (dep && kb.any(subject, dep)) original[i] = kb.any(subject, dep).toNT()
        }

        const fn = fieldFunction(dom, field)

        const itemChanged = function (ok, body) {
          if (ok) {
            for (let j = 0; j < p2.length; j++) {
              // This is really messy.
              const field = p2[j]
              const t = mostSpecificClassURI(field) // Field type
              if (t === ui('Options').uri) {
                const dep = kb.any(field, ui('dependingOn'))
                const newOne = fn(
                  dom,
                  box,
                  already,
                  subject,
                  field,
                  dataDoc,
                  callbackFunction
                )
                box.removeChild(newOne)
                box.insertBefore(newOne, eles[j])
                box.removeChild(eles[j])
                original[j] = kb.any(subject, dep).toNT()
                eles[j] = newOne
              }
            }
          }
          callbackFunction(ok, body)
        }
        eles.push(fn(dom, box, already2, subject, field, dataDoc, itemChanged))
      }
      return box
    }

/**          Options field: Select one or more cases
 **
 ** @param {Document} dom The HTML Document object aka Document Object Model
 ** @param {Element?} container  If present, the created widget will be appended to this
 ** @param {Map} already A hash table of (form, subject) kept to prevent recursive forms looping
 ** @param {Node} subject The thing about which the form displays/edits data
 ** @param {Node} form The form or field to be rendered
 ** @param {Node} dataDoc The web document in which the data is
 ** @param {function(ok, errorMessage)} callbackFunction Called when data is changed?
 **
 ** @returns {Element} The HTML widget created
 */

forms.field[ns.ui('Options').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  const kb = store
  const box = dom.createElement('div')
  const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know

  // box.setAttribute('style', 'padding-left: 2em; border: 0.05em dotted purple;')  // Indent Options
  const ui = ns.ui
  if (container) container.appendChild(box)

  let dependingOn = kb.any(form, ui('dependingOn'))
  if (!dependingOn) {
    dependingOn = ns.rdf('type')
  } // @@ default to type (do we want defaults?)
  const cases = kb.each(form, ui('case'), null, formDoc)
  if (!cases) {
    box.appendChild(errorMessageBlock(dom, 'No cases to Options form. '))
  }
  let values
  if (dependingOn.sameTerm(ns.rdf('type'))) {
    values = kb.findTypeURIs(subject)
  } else {
    const value = kb.any(subject, dependingOn)
    if (value === undefined) {
      box.appendChild(
        errorMessageBlock(
          dom,
          "Can't select subform as no value of: " + dependingOn
        )
      )
    } else {
      values = {}
      values[value.uri] = true
    }
  }
  // @@ Add box.refresh() to sync fields with values
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const tests = kb.each(c, ui('for'), null, formDoc) // There can be multiple 'for'
    for (let j = 0; j < tests.length; j++) {
      if (values[tests[j].uri]) {
        const field = kb.the(c, ui('use'))
        if (!field) {
          box.appendChild(
            errorMessageBlock(
              dom,
              'No "use" part for case in form ' + form
            )
          )
          return box
        } else {
          forms.appendForm(
            dom,
            box,
            already,
            subject,
            field,
            dataDoc,
            callbackFunction
          )
        }
        break
      }
    }
  }
  return box
}

/**          Multiple field: zero or more similar subFields
 **
 ** @param {Document} dom The HTML Document object aka Document Object Model
 ** @param {Element?} container  If present, the created widget will be appended to this
 ** @param {Map} already A hash table of (form, subject) kept to prevent recursive forms looping
 ** @param {Node} subject The thing about which the form displays/edits data
 ** @param {Node} form The form or field to be rendered
 ** @param {Node} dataDoc The web document in which the data is
 ** @param {function(ok, errorMessage)} callbackFunction Called when data is changed?
 **
 ** @returns {Element} The HTML widget created
 **
 ** Form properties:
 **      @param {Boolean} reverse Make e reverse arc in the data OPS not SPO
 **      @param {NamedNode} property The property to be written in the data
 **      @param {Boolean} ordered Is the list an ordered one where the user defined the order
 */
forms.field[ns.ui('Multiple').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  /** Diagnostic function
  */
  function debugString (values) {
    return values.map(x => x.toString().slice(-7)).join(', ')
  }

  /** Add an item to the local quadstore not the UI or the web
  *
   * @param {Node} object The RDF object to be represented by this item.
   */
  async function addItem () {
    const object = forms.newThing(dataDoc) // by default just add new nodes
    if (ordered) {
      createListIfNecessary() // Sets list and unsavedList
      list.elements.push(object)
      await saveListThenRefresh()
    } else {
      // eslint-disable-next-line multiline-ternary
      const toBeInserted = reverse ? [$rdf.st(object, property, subject, dataDoc)] : [$rdf.st(subject, property, object, dataDoc)]
      try {
        await kb.updater.update([], toBeInserted)
      } catch (err) {
        const msg = 'Error adding to unordered multiple: ' + err
        box.appendChild(errorMessageBlock(dom, msg))
        debug.error(msg)
      }
      refresh()
    }
  }

  /** Make a dom representation for an item
   * @param {Event} anyEvent if used as an event handler
   * @param {Node} object The RDF object to be represented by this item.
   */
  function renderItem (object) {
    async function deleteThisItem () {
      if (ordered) {
        debug.log('pre delete: ' + debugString(list.elements))
        for (let i = 0; i < list.elements.length; i++) {
          if (list.elements[i].sameTerm(object)) {
            list.elements.splice(i, 1)
            await saveListThenRefresh()
            return
          }
        }
      } else {
        // unordered
        if (kb.holds(subject, property, object, dataDoc)) {
          const del = [$rdf.st(subject, property, object, dataDoc)]
          kb.updater.update(del, [], function (uri, ok, message) {
            if (ok) {
              body.removeChild(subField)
            } else {
              body.appendChild(
                errorMessageBlock(
                  dom,
                  'Multiple: delete failed: ' + message
                )
              )
            }
          })
        }
      }
    }

    /** Move the object up or down in the ordered list
     * @param {Event} anyEvent if used as an event handler
     * @param {Boolean} upwards Move this up (true) or down (false).
     */
    async function moveThisItem (event, upwards) {
      // @@ possibly, allow shift+click to do move to top or bottom?
      debug.log('pre move: ' + debugString(list.elements))
      let i
      for (i = 0; i < list.elements.length; i++) {
        // Find object in array
        if (list.elements[i].sameTerm(object)) {
          break
        }
      }
      if (i === list.elements.length) {
        alert('list move: not found element for ' + object)
      }
      if (upwards) {
        if (i === 0) {
          alert('@@ boop - already at top   -temp message') // @@ make boop sound
          return
        }
        list.elements.splice(i - 1, 2, list.elements[i], list.elements[i - 1])
      } else {
        // downwards
        if (i === list.elements.length - 1) {
          alert('@@ boop - already at bottom   -temp message') // @@ make boop sound
          return
        }
        list.elements.splice(i, 2, list.elements[i + 1], list.elements[i])
      }
      await saveListThenRefresh()
    }
    /* A subField has been filled in
    *
    * One possibility is to not actually make the link to the thing until
    * this callback happens to avoid widow links
     */
    function itemDone (uri, ok, message) {
      debug.log(`Item ${uri} done callback for item ${object.uri.slice(-7)}`)
      if (!ok) { // when does this happen? errors typically deal with upstream
        debug.error('  Item done callback: Error: ' + message)
      } else {
        linkDone(uri, ok, message)
      }
    }
    const linkDone = function (uri, ok, message) {
      return callbackFunction(ok, message)
    }

    log.debug('Multiple: render object: ' + object)

    const fn = fieldFunction(dom, element)
    const subField = fn(dom, null, already, object, element, dataDoc, itemDone) // p2 was: body.  moving to not passing that
    subField.subject = object // Keep a back pointer between the DOM array and the RDF objects

    // delete button and move buttons
    if (kb.updater.editable(dataDoc.uri)) {
      buttons.deleteButtonWithCheck(dom, subField, utils.label(property),
        deleteThisItem)
      if (ordered) {
        subField.appendChild(
          buttons.button(
            dom, icons.iconBase + 'noun_1369237.svg', 'Move Up',
            async event => moveThisItem(event, true))
        )
        subField.appendChild(
          buttons.button(
            dom, icons.iconBase + 'noun_1369241.svg', 'Move Down',
            async event => moveThisItem(event, false))
        )
      }
    }
    return subField // unused
  } // renderItem

  /// ///////// Body of Multiple form field implementation

  const plusIconURI = icons.iconBase + 'noun_19460_green.svg' // white plus in green circle

  const kb = store
  const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know

  const box = dom.createElement('table')
  // We don't indent multiple as it is a sort of a prefix of the next field and has contents of one.
  // box.setAttribute('style', 'padding-left: 2em; border: 0.05em solid green;')  // Indent a multiple
  const ui = ns.ui
  if (container) container.appendChild(box)

  const orderedNode = kb.any(form, ui('ordered'))
  const ordered = orderedNode ? $rdf.Node.toJS(orderedNode) : false

  const property = kb.any(form, ui('property'))
  const reverse = kb.anyJS(form, ui('reverse'), null, formDoc)
  if (!property) {
    box.appendChild(
      errorMessageBlock(dom, 'No property to multiple: ' + form)
    ) // used for arcs in the data
    return box
  }
  let min = kb.any(form, ui('min')) // This is the minimum number -- default 0
  min = min ? 0 + min.value : 0
  // var max = kb.any(form, ui('max')) // This is the minimum number
  // max = max ? max.value : 99999999

  var element = kb.any(form, ui('part')) // This is the form to use for each one
  if (!element) {
    box.appendChild(
      errorMessageBlock(dom, 'No part to multiple: ' + form)
    )
    return box
  }

  var body = box.appendChild(dom.createElement('tr')) // 20191207
  let list // The RDF collection which keeps the ordered version or null
  let values // Initial values - always an array.  Even when no list yet.
  values = reverse ? kb.any(null, property, subject, dataDoc) : kb.any(subject, property, null, dataDoc)
  if (ordered) {
    list = reverse ? kb.any(null, property, subject, dataDoc) : kb.any(subject, property, null, dataDoc)
    if (list) {
      values = list.elements
    } else {
      values = []
    }
  } else {
    values = reverse ? kb.each(null, property, subject, dataDoc) : kb.each(subject, property, null, dataDoc)
    list = null
  }
  // Add control on the bottom for adding more items
  if (kb.updater.editable(dataDoc.uri)) {
    const tail = box.appendChild(dom.createElement('tr'))
    tail.style.padding = '0.5em'
    const img = tail.appendChild(dom.createElement('img'))
    img.setAttribute('src', plusIconURI) //  plus sign
    img.setAttribute('style', 'margin: 0.2em; width: 1.5em; height:1.5em')
    img.title = 'Click to add one or more ' + utils.predicateLabel(property, reverse)
    const prompt = tail.appendChild(dom.createElement('span'))
    prompt.textContent =
      (values.length === 0 ? 'Add one or more ' : 'Add more ') +
      utils.predicateLabel(property, reverse)
      // utils.label(property)
    tail.addEventListener('click', async _eventNotUsed => {
      await addItem()
    }, true)
  }

  function createListIfNecessary () {
    if (!list) {
      list = new $rdf.Collection()
      if (reverse) {
        kb.add(list, property, subject, dataDoc)
      } else {
        kb.add(subject, property, list, dataDoc)
      }
    }
  }

  async function saveListThenRefresh () {
    debug.log('save list: ' + debugString(list.elements)) // 20191214

    createListIfNecessary()
    try {
      await kb.fetcher.putBack(dataDoc)
    } catch (err) {
      box.appendChild(
        errorMessageBlock(dom, 'Error trying to put back a list: ' + err)
      )
      return
    }
    refresh()
  }

  function refresh () {
    let vals
    if (ordered) {
      const li = reverse ? kb.the(null, property, subject, dataDoc) : kb.the(subject, property, null, dataDoc)
      vals = li ? li.elements : []
    } else {
      vals = reverse ? kb.each(null, property, subject, dataDoc) : kb.each(subject, property, null, dataDoc)
      vals.sort() // achieve consistency on each refresh
    }
    utils.syncTableToArrayReOrdered(body, vals, renderItem)
  }
  body.refresh = refresh // Allow live update
  refresh()

  async function asyncStuff () {
    const extra = min - values.length
    if (extra > 0) {
      for (let j = 0; j < extra; j++) {
        debug.log('Adding extra: min ' + min)
        await addItem() // Add blanks if less than minimum
      }
      await saveListThenRefresh()
    }
    // if (unsavedList) {
    //     await saveListThenRefresh() // async
    // }
  }
  asyncStuff().then(
    () => { debug.log(' Multiple render: async stuff ok') },
    (err) => { debug.error(' Multiple render: async stuff fails. #### ', err) }
  ) // async

  return box
} // Multiple

/*          Text field
 **
 */
// For possible date popups see e.g. http://www.dynamicdrive.com/dynamicindex7/jasoncalendar.htm
// or use HTML5: http://www.w3.org/TR/2011/WD-html-markup-20110113/input.date.html
//

forms.fieldParams = fieldParams

forms.field[ns.ui('PhoneField').uri] = basicField
forms.field[ns.ui('EmailField').uri] = basicField
forms.field[ns.ui('ColorField').uri] = basicField
forms.field[ns.ui('DateField').uri] = basicField
forms.field[ns.ui('DateTimeField').uri] = basicField
forms.field[ns.ui('TimeField').uri] = basicField
forms.field[ns.ui('NumericField').uri] = basicField
forms.field[ns.ui('IntegerField').uri] = basicField
forms.field[ns.ui('DecimalField').uri] = basicField
forms.field[ns.ui('FloatField').uri] = basicField
forms.field[ns.ui('TextField').uri] = basicField
forms.field[ns.ui('SingleLineTextField').uri] = basicField
forms.field[ns.ui('NamedNodeURIField').uri] = basicField

/*          Multiline Text field
 **
 */

forms.field[ns.ui('MultiLineTextField').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  const ui = ns.ui
  const kb = store
  const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know

  const property = kb.any(form, ui('property'))
  if (!property) {
    return errorMessageBlock(dom, 'No property to text field: ' + form)
  }
  const box = dom.createElement('div')
  box.appendChild(forms.fieldLabel(dom, property, form))
  dataDoc = forms.fieldStore(subject, property, dataDoc)

  const text = kb.anyJS(subject, property, null, dataDoc) || ''
  const editable = kb.updater.editable(dataDoc.uri)
  const suppressEmptyUneditable = form && kb.anyJS(form, ns.ui('suppressEmptyUneditable'), null, formDoc)

  if (!editable && suppressEmptyUneditable && text === '') {
    box.style.display = 'none'
  }
  const field = forms.makeDescription(
    dom,
    kb,
    subject,
    property,
    dataDoc,
    callbackFunction
  )
  // box.appendChild(dom.createTextNode('<-@@ subj:'+subject+', prop:'+property))
  box.appendChild(field)
  if (container) container.appendChild(box)
  return box
}

/*          Boolean field  and Tri-state version (true/false/null)
 **
 ** @@ todo: remove tristate param
 */
function booleanField (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction,
  tristate
) {
  const ui = ns.ui
  const kb = store
  const property = kb.any(form, ui('property'))
  if (!property) {
    const errorBlock = errorMessageBlock(
      dom,
      'No property to boolean field: ' + form
    )
    if (container) container.appendChild(errorBlock)
    return errorBlock
  }
  let lab = kb.any(form, ui('label'))
  if (!lab) lab = utils.label(property, true) // Init capital
  dataDoc = forms.fieldStore(subject, property, dataDoc)
  let state = kb.any(subject, property)
  if (state === undefined) {
    state = false
  } // @@ sure we want that -- or three-state?
  // log.debug('dataDoc is '+dataDoc)
  const ins = $rdf.st(subject, property, true, dataDoc)
  const del = $rdf.st(subject, property, false, dataDoc)
  const box = buildCheckboxForm(dom, kb, lab, del, ins, form, dataDoc, tristate)
  if (container) container.appendChild(box)
  return box
}
forms.field[ns.ui('BooleanField').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  return booleanField(
    dom,
    container,
    already,
    subject,
    form,
    dataDoc,
    callbackFunction,
    false
  )
}

forms.field[ns.ui('TristateField').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  return booleanField(
    dom,
    container,
    already,
    subject,
    form,
    dataDoc,
    callbackFunction,
    true
  )
}

/*          Classifier field
 **
 **  Nested categories
 **
 ** @@ To do: If a classification changes, then change any dependent Options fields.
 */

forms.field[ns.ui('Classifier').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  const kb = store
  const ui = ns.ui
  const category = kb.any(form, ui('category'))
  if (!category) {
    return errorMessageBlock(dom, 'No category for classifier: ' + form)
  }
  log.debug('Classifier: dataDoc=' + dataDoc)
  const checkOptions = function (ok, body) {
    if (!ok) return callbackFunction(ok, body)

    /*
    var parent = kb.any(undefined, ui('part'), form)
    if (!parent) return callbackFunction(ok, body)
    var kids = kb.each(parent, ui('part')); // @@@@@@@@@ Garbage
    kids = kids.filter(function(k){return kb.any(k, ns.rdf('type'), ui('Options'))})
    if (kids.length) log.debug('Yes, found related options: '+kids[0])
    */
    return callbackFunction(ok, body)
  }
  const box = forms.makeSelectForNestedCategory(
    dom,
    kb,
    subject,
    category,
    dataDoc,
    checkOptions
  )
  if (container) container.appendChild(box)
  return box
}

/**         Choice field
 **
 **  Not nested.  Generates a link to something from a given class.
 **  Optional subform for the thing selected.
 **  Alternative implementatons caould be:
 ** -- pop-up menu (as here)
 ** -- radio buttons
 ** -- auto-complete typing
 **
 ** Todo: Deal with multiple.  Maybe merge with multiple code.
 */

forms.field[ns.ui('Choice').uri] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  callbackFunction
) {
  const ui = ns.ui
  const kb = store
  const multiple = false
  const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know

  let p
  const box = dom.createElement('tr')
  if (container) container.appendChild(box)
  const lhs = dom.createElement('td')
  box.appendChild(lhs)
  const rhs = dom.createElement('td')
  box.appendChild(rhs)
  const property = kb.any(form, ui('property'))
  if (!property) {
    return box.appendChild(errorMessageBlock(dom, 'No property for Choice: ' + form))
  }
  lhs.appendChild(forms.fieldLabel(dom, property, form))
  const from = kb.any(form, ui('from'))
  if (!from) {
    return errorMessageBlock(dom, "No 'from' for Choice: " + form)
  }
  const subForm = kb.any(form, ui('use')) // Optional
  const follow = kb.anyJS(form, ui('follow'), null, formDoc) // data doc moves to new subject?
  let possible = []
  let possibleProperties
  const np = '--' + utils.label(property) + '-?'
  const opts = { multiple: multiple, nullLabel: np, disambiguate: false }
  possible = kb.each(undefined, ns.rdf('type'), from, formDoc)
  for (const x in kb.findMembersNT(from)) {
    possible.push(kb.fromNT(x))
    // box.appendChild(dom.createTextNode("RDFS: adding "+x))
  } // Use rdfs
  // log.debug("%%% Choice field: possible.length 1 = "+possible.length)
  if (from.sameTerm(ns.rdfs('Class'))) {
    for (p in buttons.allClassURIs()) possible.push(kb.sym(p))
    // log.debug("%%% Choice field: possible.length 2 = "+possible.length)
  } else if (from.sameTerm(ns.rdf('Property'))) {
    possibleProperties = buttons.propertyTriage(kb)
    for (p in possibleProperties.op) possible.push(kb.fromNT(p))
    for (p in possibleProperties.dp) possible.push(kb.fromNT(p))
    opts.disambiguate = true // This is a big class, and the labels won't be enough.
  } else if (from.sameTerm(ns.owl('ObjectProperty'))) {
    possibleProperties = buttons.propertyTriage(kb)
    for (p in possibleProperties.op) possible.push(kb.fromNT(p))
    opts.disambiguate = true
  } else if (from.sameTerm(ns.owl('DatatypeProperty'))) {
    possibleProperties = buttons.propertyTriage(kb)
    for (p in possibleProperties.dp) possible.push(kb.fromNT(p))
    opts.disambiguate = true
  }
  let object = kb.any(subject, property)
  function addSubForm () {
    object = kb.any(subject, property)
    fieldFunction(dom, subForm)(
      dom,
      rhs,
      already,
      object,
      subForm,
      follow ? object.doc() : dataDoc,
      callbackFunction
    )
  }
  const possible2 = forms.sortByLabel(possible)
  if (kb.any(form, ui('canMintNew'))) {
    opts.mint = '* New *' // @@ could be better
    opts.subForm = subForm
  }
  const selector = forms.makeSelectForOptions(
    dom,
    kb,
    subject,
    property,
    possible2,
    opts,
    dataDoc,
    callbackFunction
  )
  rhs.appendChild(selector)
  if (object && subForm) addSubForm()
  return box
}

//          Documentation - non-interactive fields
//

forms.field[ns.ui('Comment').uri] = forms.field[
  ns.ui('Heading').uri
] = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  _callbackFunction
) {
  const ui = ns.ui
  const kb = store
  let contents = kb.any(form, ui('contents'))
  if (!contents) contents = 'Error: No contents in comment field.'
  const formDoc = form.doc ? form.doc() : null // @@ if blank no way to know

  const uri = mostSpecificClassURI(form)
  let params = forms.fieldParams[uri]
  if (params === undefined) {
    params = {}
  } // non-bottom field types can do this

  const box = dom.createElement('div')
  if (container) container.appendChild(box)
  const p = box.appendChild(dom.createElement(params.element))
  p.textContent = contents

  const style = kb.anyValue(form, ui('style')) || params.style || ''
  if (style) p.setAttribute('style', style)

  // Some headings and prompts are only useful to guide user input
  const suppressIfUneditable = kb.anyJS(form, ns.ui('suppressIfUneditable'), null, formDoc)
  const editable = kb.updater.editable(dataDoc.uri)
  if (suppressIfUneditable && !editable) {
    box.style.display = 'none'
  }
  return box
}

// A button for editing a form (in place, at the moment)
//
//  When editing forms, make it yellow, when editing thr form form, pink
// Help people understand how many levels down they are.
//
forms.editFormButton = function (
  dom,
  container,
  form,
  dataDoc,
  callbackFunction
) {
  const b = dom.createElement('button')
  b.setAttribute('type', 'button')
  b.innerHTML = 'Edit ' + utils.label(ns.ui('Form'))
  b.addEventListener(
    'click',
    function (_e) {
      const ff = forms.appendForm(
        dom,
        container,
        {},
        form,
        ns.ui('FormForm'),
        dataDoc,
        callbackFunction
      )
      ff.setAttribute(
        'style',
        ns.ui('FormForm').sameTerm(form)
          ? 'background-color: #fee;'
          : 'background-color: #ffffe7;'
      )
      b.parentNode.removeChild(b)
    },
    true
  )
  return b
}

forms.appendForm = function (
  dom,
  container,
  already,
  subject,
  form,
  dataDoc,
  itemDone
) {
  return fieldFunction(dom, form)(
    dom,
    container,
    already,
    subject,
    form,
    dataDoc,
    itemDone
  )
}

/**          Find list of properties for class
//
// Three possible sources: Those mentioned in schemas, which exludes many
// those which occur in the data we already have, and those predicates we
// have come across anywhere and which are not explicitly excluded from
// being used with this class.
*/

forms.propertiesForClass = function (kb, c) {
  const explicit = kb.each(undefined, ns.rdf('range'), c)
  ;[
    ns.rdfs('comment'),
    ns.dc('title'), // Generic things
    ns.foaf('name'),
    ns.foaf('homepage')
  ].forEach(function (x) {
    explicit.push(x)
  })
  let members = kb.each(undefined, ns.rdf('type'), c)
  if (members.length > 60) members = members.slice(0, 60) // Array supports slice?
  const used = {}
  for (let i = 0; i < (members.length > 60 ? 60 : members.length); i++) {
    kb.statementsMatching(members[i], undefined, undefined).forEach(function (st) {
      used[st.predicate.uri] = true
    })
  }
  explicit.forEach(function (p) {
    used[p.uri] = true
  })
  const result = []
  for (const uri in used) {
    result.push(kb.sym(uri))
  }
  return result
}

/** Find the closest class
* @param kb The quad store
* @param cla - the URI of the class
* @param prop
*/
forms.findClosest = function findClosest (kb, cla, prop) {
  const agenda = [kb.sym(cla)] // ordered - this is breadth first search
  while (agenda.length > 0) {
    const c = agenda.shift() // first
    // if (c.uri && (c.uri == ns.owl('Thing').uri || c.uri == ns.rdf('Resource').uri )) continue
    const lists = kb.each(c, prop)
    log.debug('Lists for ' + c + ', ' + prop + ': ' + lists.length)
    if (lists.length !== 0) return lists
    const supers = kb.each(c, ns.rdfs('subClassOf'))
    for (let i = 0; i < supers.length; i++) {
      agenda.push(supers[i])
      log.debug('findClosest: add super: ' + supers[i])
    }
  }
  return []
}

// Which forms apply to a given existing subject?

forms.formsFor = function (subject) {
  const kb = store

  log.debug('formsFor: subject=' + subject)
  const t = kb.findTypeURIs(subject)
  let t1
  for (t1 in t) {
    log.debug('   type: ' + t1)
  }
  const bottom = kb.bottomTypeURIs(t) // most specific
  let candidates = []
  for (const b in bottom) {
    // Find the most specific
    log.debug('candidatesFor: trying bottom type =' + b)
    candidates = candidates.concat(
      forms.findClosest(kb, b, ns.ui('creationForm'))
    )
    candidates = candidates.concat(
      forms.findClosest(kb, b, ns.ui('annotationForm'))
    )
  }
  return candidates
}

forms.sortBySequence = function (list) {
  const p2 = list.map(function (p) {
    const k = kb.any(p, ns.ui('sequence'))
    return [k || 9999, p]
  })
  p2.sort(function (a, b) {
    return a[0] - b[0]
  })
  return p2.map(function (pair) {
    return pair[1]
  })
}

forms.sortByLabel = function (list) {
  const p2 = list.map(function (p) {
    return [utils.label(p).toLowerCase(), p]
  })
  p2.sort()
  return p2.map(function (pair) {
    return pair[1]
  })
}

/** Button to add a new whatever using a form
//
// @param form - optional form , else will look for one
// @param dataDoc - optional dataDoc else will prompt for one (unimplemented)
*/
forms.newButton = function (
  dom,
  kb,
  subject,
  predicate,
  theClass,
  form,
  dataDoc,
  callbackFunction
) {
  const b = dom.createElement('button')
  b.setAttribute('type', 'button')
  b.innerHTML = 'New ' + utils.label(theClass)
  b.addEventListener(
    'click',
    function (_e) {
      b.parentNode.appendChild(
        forms.promptForNew(
          dom,
          kb,
          subject,
          predicate,
          theClass,
          form,
          dataDoc,
          callbackFunction
        )
      )
    },
    false
  )
  return b
}

/**      Prompt for new object of a given class
//
// @param dom - the document DOM for the user interface
// @param kb - the graph which is the knowledge base we are working with
// @param subject - a term, Thing this should be linked to when made. Optional.
// @param predicate - a term, the relationship for the subject link. Optional.
// @param theClass - an RDFS class containng the object about which the new information is.
// @param form  - the form to be used when a new one. null means please find one.
// @param dataDoc - The web document being edited
// @param callbackFunction - takes (boolean ok, string errorBody)
// @returns a dom object with the form DOM
*/
forms.promptForNew = function (
  dom,
  kb,
  subject,
  predicate,
  theClass,
  form,
  dataDoc,
  callbackFunction
) {
  const box = dom.createElement('form')

  if (!form) {
    const lists = forms.findClosest(kb, theClass.uri, ns.ui('creationForm'))
    if (lists.length === 0) {
      const p = box.appendChild(dom.createElement('p'))
      p.textContent =
        'I am sorry, you need to provide information about a ' +
        utils.label(theClass) +
        " but I don't know enough information about those to ask you."
      const b = box.appendChild(dom.createElement('button'))
      b.setAttribute('type', 'button')
      b.setAttribute('style', 'float: right;')
      b.innerHTML = 'Goto ' + utils.label(theClass)
      b.addEventListener(
        'click',
        function (_e) {
          dom.outlineManager.GotoSubject(
            theClass,
            true,
            undefined,
            true,
            undefined
          )
        },
        false
      )
      return box
    }
    log.debug('lists[0] is ' + lists[0])
    form = lists[0] // Pick any one
  }
  log.debug('form is ' + form)
  box.setAttribute('style', `border: 0.05em solid ${style.formBorderColor}; color: ${style.formBorderColor}`) // @@color?
  box.innerHTML = '<h3>New ' + utils.label(theClass) + '</h3>'

  const formFunction = fieldFunction(dom, form)
  const object = forms.newThing(dataDoc)
  let gotButton = false
  const itemDone = function (ok, body) {
    if (!ok) return callbackFunction(ok, body)
    const insertMe = []
    if (subject && !kb.holds(subject, predicate, object, dataDoc)) {
      insertMe.push($rdf.st(subject, predicate, object, dataDoc))
    }
    if (subject && !kb.holds(object, ns.rdf('type'), theClass, dataDoc)) {
      insertMe.push($rdf.st(object, ns.rdf('type'), theClass, dataDoc))
    }
    if (insertMe.length) {
      kb.updater.update([], insertMe, linkDone)
    } else {
      callbackFunction(true, body)
    }
    if (!gotButton) {
      gotButton = box.appendChild(forms.linkButton(dom, object))
    }
    // tabulator.outline.GotoSubject(object, true, undefined, true, undefined)
  }
  function linkDone (uri, ok, body) {
    return callbackFunction(ok, body)
  }
  log.info('paneUtils Object is ' + object)
  const f = formFunction(dom, box, {}, object, form, dataDoc, itemDone)
  const rb = forms.removeButton(dom, f)
  rb.setAttribute('style', 'float: right;')
  box.AJAR_subject = object
  return box
}

forms.makeDescription = function (
  dom,
  kb,
  subject,
  predicate,
  dataDoc,
  callbackFunction
) {
  const group = dom.createElement('div')
  const desc = kb.anyJS(subject, predicate, null, dataDoc) || ''

  const field = dom.createElement('textarea')
  group.appendChild(field)
  field.rows = desc ? desc.split('\n').length + 2 : 2
  field.cols = 80

  field.setAttribute('style', style.multilineTextInputStyle)
  if (desc !== null) {
    field.value = desc
  } else {
    // Unless you can make the predicate label disappear with the first click then this is over-cute
    // field.value = utils.label(predicate); // Was"enter a description here"
    field.select() // Select it ready for user input -- doesn't work
  }

  group.refresh = function () {
    const v = kb.any(subject, predicate, null, dataDoc)
    if (v && v.value !== field.value) {
      field.value = v.value // don't touch widget if no change
      // @@ this is the place to color the field from the user who chanaged it
    }
  }
  function saveChange (_e) {
    submit.disabled = true
    submit.setAttribute('style', 'visibility: hidden; float: right;') // Keep UI clean
    field.disabled = true
    field.setAttribute('style', style + 'color: gray;') // pending
    const ds = kb.statementsMatching(subject, predicate, null, dataDoc)
    const is = $rdf.st(subject, predicate, field.value, dataDoc)
    kb.updater.update(ds, is, function (uri, ok, body) {
      if (ok) {
        field.setAttribute('style', style + 'color: black;')
        field.disabled = false
      } else {
        group.appendChild(
          errorMessageBlock(
            dom,
            'Error (while saving change to ' + dataDoc.uri + '): ' + body
          )
        )
      }
      if (callbackFunction) {
        callbackFunction(ok, body)
      }
    })
  }

  const br = dom.createElement('br')
  group.appendChild(br)

  const editable = kb.updater.editable(dataDoc.uri)
  if (editable) {
    var submit = dom.createElement('input')
    submit.setAttribute('type', 'submit')
    submit.disabled = true // until the filled has been modified
    submit.setAttribute('style', 'visibility: hidden; float: right;') // Keep UI clean
    submit.value = 'Save ' + utils.label(predicate) // @@ I18n
    group.appendChild(submit)

    field.addEventListener(
      'keyup',
      function (_e) {
        // Green means has been changed, not saved yet
        field.setAttribute('style', style + 'color: green;')
        if (submit) {
          submit.disabled = false
          submit.setAttribute('style', 'float: right;') // Remove visibility: hidden
        }
      },
      true
    )
    field.addEventListener('change', saveChange, true)
    submit.addEventListener('click', saveChange, false)
  } else {
    field.disabled = true // @@ change color too
    field.style.backgroundColor = style.textInputBackgroundColorUneditable
  }
  return group
}

/** Make SELECT element to select options
//
// @param subject - a term, the subject of the statement(s) being edited.
// @param predicate - a term, the predicate of the statement(s) being edited
// @param possible - a list of terms, the possible value the object can take
// @param options.multiple - Boolean - Whether more than one at a time is allowed
// @param options.nullLabel - a string to be displayed as the
//                        option for none selected (for non multiple)
// @param options.mint - User may create thing if this sent to the prompt string eg "New foo"
// @param options.subForm - If mint, then the form to be used for minting the new thing
// @param dataDoc - The web document being edited
// @param callbackFunction - takes (boolean ok, string errorBody)
*/
forms.makeSelectForOptions = function (
  dom,
  kb,
  subject,
  predicate,
  possible,
  options,
  dataDoc,
  callbackFunction
) {
  log.debug('Select list length now ' + possible.length)
  let n = 0
  const uris = {} // Count them
  const editable = kb.updater.editable(dataDoc.uri)

  for (let i = 0; i < possible.length; i++) {
    const sub = possible[i] // @@ Maybe; make this so it works with blank nodes too
    if (!sub.uri) debug.warn(`makeSelectForOptions: option does not have an uri: ${sub}, with predicate: ${predicate}`)
    if (!sub.uri || sub.uri in uris) continue
    uris[sub.uri] = true
    n++
  } // uris is now the set of possible options
  if (n === 0 && !options.mint) {
    return errorMessageBlock(
      dom,
      "Can't do selector with no options, subject= " +
        subject +
        ' property = ' +
        predicate +
        '.'
    )
  }
  if (options.mint && !options.subForm) {
    return errorMessageBlock(dom, "Selector: can't mint new with no subform.")
  }
  log.debug('makeSelectForOptions: dataDoc=' + dataDoc)

  const getActual = function () {
    actual = {}
    if (predicate.sameTerm(ns.rdf('type'))) {
      actual = kb.findTypeURIs(subject)
    } else {
      kb.each(subject, predicate, null, dataDoc).forEach(function (x) {
        actual[x.uri] = true
      })
    }
    return actual
  }
  var actual = getActual()

  // var newObject = null

  const onChange = function (_e) {
    select.disabled = true // until data written back - gives user feedback too
    const ds = []
    let is = []
    const removeValue = function (t) {
      if (kb.holds(subject, predicate, t, dataDoc)) {
        ds.push($rdf.st(subject, predicate, t, dataDoc))
      }
    }
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i]
      if (opt.selected && opt.AJAR_mint) {
        var newObject
        if (options.mintClass) {
          const thisForm = forms.promptForNew(
            dom,
            kb,
            subject,
            predicate,
            options.mintClass,
            null,
            dataDoc,
            function (ok, body) {
              if (!ok) {
                callbackFunction(ok, body) // @@ if ok, need some form of refresh of the select for the new thing
              }
            }
          )
          select.parentNode.appendChild(thisForm)
          newObject = thisForm.AJAR_subject
        } else {
          newObject = forms.newThing(dataDoc)
        }
        is.push($rdf.st(subject, predicate, newObject, dataDoc))
        if (options.mintStatementsFun) {
          is = is.concat(options.mintStatementsFun(newObject))
        }
      }
      if (!opt.AJAR_uri) continue // a prompt or mint
      if (opt.selected && !(opt.AJAR_uri in actual)) {
        // new class
        is.push($rdf.st(subject, predicate, kb.sym(opt.AJAR_uri), dataDoc))
      }
      if (!opt.selected && opt.AJAR_uri in actual) {
        // old class
        removeValue(kb.sym(opt.AJAR_uri))
        // ds.push($rdf.st(subject, predicate, kb.sym(opt.AJAR_uri), dataDoc ))
      }
      if (opt.selected) select.currentURI = opt.AJAR_uri
    }
    let sel = select.subSelect // All subclasses must also go
    while (sel && sel.currentURI) {
      removeValue(kb.sym(sel.currentURI))
      sel = sel.subSelect
    }
    sel = select.superSelect // All superclasses are redundant
    while (sel && sel.currentURI) {
      removeValue(kb.sym(sel.currentURI))
      sel = sel.superSelect
    }
    function doneNew (ok, body) {
      callbackFunction(ok, body)
    }
    log.info('selectForOptions: data doc = ' + dataDoc)
    kb.updater.update(ds, is, function (uri, ok, body) {
      actual = getActual() // refresh
      // kb.each(subject, predicate, null, dataDoc).map(function(x){actual[x.uri] = true})
      if (ok) {
        select.disabled = false // data written back
        if (newObject) {
          const fn = fieldFunction(dom, options.subForm)
          fn(
            dom,
            select.parentNode,
            {},
            newObject,
            options.subForm,
            dataDoc,
            doneNew
          )
        }
      }
      if (callbackFunction) callbackFunction(ok, body)
    })
  }

  const select = dom.createElement('select')
  select.setAttribute('style', 'margin: 0.6em 1.5em;')
  if (options.multiple) select.setAttribute('multiple', 'true')
  select.currentURI = null

  select.refresh = function () {
    actual = getActual() // refresh
    for (let i = 0; i < select.children.length; i++) {
      const option = select.children[i]
      if (option.AJAR_uri) {
        option.selected = option.AJAR_uri in actual
      }
    }
    select.disabled = false // unlocked any conflict we had got into
  }

  for (const uri in uris) {
    const c = kb.sym(uri)
    const option = dom.createElement('option')
    if (options.disambiguate) {
      option.appendChild(dom.createTextNode(utils.labelWithOntology(c, true))) // Init. cap
    } else {
      option.appendChild(dom.createTextNode(utils.label(c, true))) // Init.
    }
    const backgroundColor = kb.any(
      c,
      kb.sym('http://www.w3.org/ns/ui#backgroundColor')
    )
    if (backgroundColor) {
      option.setAttribute(
        'style',
        'background-color: ' + backgroundColor.value + '; '
      )
    }
    option.AJAR_uri = uri
    if (uri in actual) {
      option.setAttribute('selected', 'true')
      select.currentURI = uri
      // dump("Already in class: "+ uri+"\n")
    }
    select.appendChild(option)
  }
  if (editable && options.mint) {
    const mint = dom.createElement('option')
    mint.appendChild(dom.createTextNode(options.mint))
    mint.AJAR_mint = true // Flag it
    select.insertBefore(mint, select.firstChild)
  }
  if (select.currentURI == null && !options.multiple) {
    const prompt = dom.createElement('option')
    prompt.appendChild(dom.createTextNode(options.nullLabel))
    select.insertBefore(prompt, select.firstChild)
    prompt.selected = true
  }
  if (editable) {
    select.addEventListener('change', onChange, false)
  }
  return select
} // makeSelectForOptions

// Make SELECT element to select subclasses
//
// If there is any disjoint union it will so a mutually exclusive dropdown
// Failing that it will do a multiple selection of subclasses.
// Callback takes (boolean ok, string errorBody)

forms.makeSelectForCategory = function (
  dom,
  kb,
  subject,
  category,
  dataDoc,
  callbackFunction
) {
  const du = kb.any(category, ns.owl('disjointUnionOf'))
  let subs
  let multiple = false
  if (!du) {
    subs = kb.each(undefined, ns.rdfs('subClassOf'), category)
    multiple = true
  } else {
    subs = du.elements
  }
  log.debug('Select list length ' + subs.length)
  if (subs.length === 0) {
    return errorMessageBlock(
      dom,
      "Can't do " +
        (multiple ? 'multiple ' : '') +
        'selector with no subclasses of category: ' +
        category
    )
  }
  if (subs.length === 1) {
    return errorMessageBlock(
      dom,
      "Can't do " +
        (multiple ? 'multiple ' : '') +
        'selector with only 1 subclass of category: ' +
        category +
        ':' +
        subs[1]
    )
  }
  return forms.makeSelectForOptions(
    dom,
    kb,
    subject,
    ns.rdf('type'),
    subs,
    { multiple: multiple, nullPrompt: '--classify--' },
    dataDoc,
    callbackFunction
  )
}

/** Make SELECT element to select subclasses recurively
//
// It will so a mutually exclusive dropdown, with another if there are nested
// disjoint unions.
//
// @param  callbackFunction takes (boolean ok, string errorBody)
*/
forms.makeSelectForNestedCategory = function (
  dom,
  kb,
  subject,
  category,
  dataDoc,
  callbackFunction
) {
  const container = dom.createElement('span') // Container
  let child = null
  let select
  const onChange = function (ok, body) {
    if (ok) update()
    callbackFunction(ok, body)
  }
  // eslint-disable-next-line prefer-const
  select = forms.makeSelectForCategory(
    dom,
    kb,
    subject,
    category,
    dataDoc,
    onChange
  )
  container.appendChild(select)
  var update = function () {
    // log.info("Selected is now: "+select.currentURI)
    if (child) {
      container.removeChild(child)
      child = null
    }
    if (
      select.currentURI &&
      kb.any(kb.sym(select.currentURI), ns.owl('disjointUnionOf'))
    ) {
      child = forms.makeSelectForNestedCategory(
        dom,
        kb,
        subject,
        kb.sym(select.currentURI),
        dataDoc,
        callbackFunction
      )
      select.subSelect = child.firstChild
      select.subSelect.superSelect = select
      container.appendChild(child)
    }
  }
  update()
  return container
}

/*  Build a checkbox from a given statement(s)
 **
 **  If the source document is editable, make the checkbox editable
 **
 **  ins and sel are either statements *or arrays of statements* which should be
 **  made if the checkbox is checed and unchecked respectively.
 **  tristate: Allow ins, or del, or neither
 */
function buildCheckboxForm (dom, kb, lab, del, ins, form, dataDoc, tristate) {
  // 20190115
  const box = dom.createElement('div')
  const tx = dom.createTextNode(lab)
  const editable = kb.updater.editable(dataDoc.uri)
  tx.style = style.checkboxStyle

  box.appendChild(tx)
  let input
  // eslint-disable-next-line prefer-const
  input = dom.createElement('button')

  input.setAttribute(
    'style',
    'font-size: 150%; height: 1.2em; width: 1.2em; background-color: #eef; margin: 0.1em'
  )
  box.appendChild(input)

  function fix (x) {
    if (!x) return [] // no statements
    if (x.object) {
      if (!x.why) {
        x.why = dataDoc // be back-compaitible  with old code
      }
      return [x] // one statements
    }
    if (x instanceof Array) return x
    throw new Error('buildCheckboxForm: bad param ' + x)
  }
  ins = fix(ins)
  del = fix(del)

  function holdsAll (a) {
    const missing = a.filter(
      st => !kb.holds(st.subject, st.predicate, st.object, st.why)
    )
    return missing.length === 0
  }
  function refresh () {
    let state = holdsAll(ins)
    let displayState = state
    if (del.length) {
      const negation = holdsAll(del)
      if (state && negation) {
        box.appendChild(
          widgets.errorMessageBlock(
            dom,
            'Inconsistent data in dataDoc!\n' + ins + ' and\n' + del
          )
        )
        return box
      }
      if (!state && !negation) {
        state = null
        const defa = kb.any(form, ns.ui('default'))
        displayState = defa ? defa.value === '1' : tristate ? null : false
      }
    }
    input.state = state
    input.textContent = {
      true: checkMarkCharacter,
      false: tristate ? cancelCharacter : ' ', // Just use blank when not tristate
      null: dashCharacter
    }[displayState]
  }

  refresh()
  if (!editable) return box

  const boxHandler = function (_e) {
    tx.style = 'color: #bbb;' // grey -- not saved yet
    const toDelete = input.state === true ? ins : input.state === false ? del : []
    input.newState =
      input.state === null
        ? true
        : input.state === true
          ? false
          : tristate
            ? null
            : true

    const toInsert =
      input.newState === true ? ins : input.newState === false ? del : []
    debug.log(`  Deleting  ${toDelete}`)
    debug.log(`  Inserting ${toInsert}`)
    kb.updater.update(toDelete, toInsert, function (
      uri,
      success,
      errorBody
    ) {
      if (!success) {
        if (toDelete.why) {
          const hmmm = kb.holds(
            toDelete.subject,
            toDelete.predicate,
            toDelete.object,
            toDelete.why
          )
          if (hmmm) {
            debug.log(' @@@@@ weird if 409 - does hold statement')
          }
        }
        tx.style = 'color: #black; background-color: #fee;'
        box.appendChild(
          errorMessageBlock(
            dom,
            `Checkbox: Error updating dataDoc from ${input.state} to ${
              input.newState
            }:\n\n${errorBody}`
          )
        )
      } else {
        tx.style = 'color: #black;'
        input.state = input.newState
        input.textContent = {
          true: checkMarkCharacter,
          false: cancelCharacter,
          null: dashCharacter
        }[input.state] // @@
      }
    })
  }
  input.addEventListener('click', boxHandler, false)
  return box
}
forms.buildCheckboxForm = buildCheckboxForm

forms.fieldLabel = function (dom, property, form) {
  let lab = kb.any(form, ns.ui('label'))
  if (!lab) lab = utils.label(property, true) // Init capital
  if (property === undefined) {
    return dom.createTextNode('@@Internal error: undefined property')
  }
  const anchor = dom.createElement('a')
  if (property.uri) anchor.setAttribute('href', property.uri)
  anchor.setAttribute('style', 'color: #3B5998; text-decoration: none;') // Not too blue and no underline
  anchor.textContent = lab
  return anchor
}

forms.fieldStore = function (subject, predicate, def) {
  const sts = kb.statementsMatching(subject, predicate)
  if (sts.length === 0) return def // can used default as no data yet
  if (
    sts.length > 0 &&
    sts[0].why.uri &&
    kb.updater.editable(sts[0].why.uri)
  ) {
    return kb.sym(sts[0].why.uri)
  }
  return def
}

/** Mint local ID using timestamp
 * @param {NamedNode} doc - the document in which the ID is to be generated
 */
forms.newThing = function (doc) {
  const now = new Date()
  return $rdf.sym(doc.uri + '#' + 'id' + ('' + now.getTime()))
}
