/**
 * dom.js — helper DOM kecil supaya file komponen tidak berulang boilerplate.
 */

export function $(id){ return document.getElementById(id); }

export function unSkel(el){ if (el) el.classList.remove('skel'); }

export function createEl(tag, classes, text){
  const el = document.createElement(tag);
  if (classes){
    if (Array.isArray(classes)) el.classList.add(...classes);
    else el.className = classes;
  }
  if (text != null) el.textContent = text;
  return el;
}

export function clearNode(node){
  while (node.firstChild) node.removeChild(node.firstChild);
}
