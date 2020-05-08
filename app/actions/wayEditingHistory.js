import * as types from './actionTypes'
import { getFeaturesFromState } from '../selectors'
// import _cloneDeep from 'lodash.clonedeep'
import modifySharedWays from '../utils/modify-shared-ways'

export function addNode (node) {
  return {
    type: types.WAY_EDIT_ADD_NODE,
    node
  }
}

export function moveSelectedNode (node, coordinates) {
  return (dispatch, getState) => {
    // if the node has other ways that it is a member of
    // find those ways from the state, and dispatch edit on that way as well
    let modifiedSharedWays
    if (node.properties.ways) {
      const sharedWays = getFeaturesFromState(getState(), Object.keys(node.properties.ways))
      if (sharedWays.length) {
        modifiedSharedWays = modifySharedWays(sharedWays, node, coordinates, 'MOVE')
      }
    }

    dispatch({
      type: types.WAY_EDIT_MOVE_NODE,
      node,
      coordinates,
      modifiedSharedWays
    })
  }
}

export function deleteSelectedNode (node) {
  return (dispatch, getState) => {
    let modifiedSharedWays
    if (node.properties.ways) {
      const sharedWays = getFeaturesFromState(getState(), Object.keys(node.properties.ways))
      if (sharedWays.length) {
        modifiedSharedWays = modifySharedWays(sharedWays, node, null, 'DELETE')
      }
    }

    dispatch({
      type: types.WAY_EDIT_DELETE_NODE,
      node,
      modifiedSharedWays
    })
  }
}