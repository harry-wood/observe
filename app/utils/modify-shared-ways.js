import _cloneDeep from 'lodash.clonedeep'
import _findIndex from 'lodash.findindex'
import _isEqual from 'lodash.isequal'

export default function modifySharedWays (sharedWays, node, coordinates, destinationNode, action) {
  let modifiedSharedWays = []

  switch (action) {
    case 'MOVE':
      sharedWays.forEach(oldWay => {
        const newWay = _cloneDeep(oldWay)
        const indexOfNodeInWay = node.properties.ways[oldWay.properties.id.split('/')[1]] || node.properties.ways[oldWay.properties.id]
        if (newWay.geometry.type === 'LineString') {
          newWay.geometry.coordinates[indexOfNodeInWay] = coordinates
        }

        if (newWay.geometry.type === 'Polygon') {
          newWay.geometry.coordinates[0][indexOfNodeInWay] = coordinates
        }

        if (!newWay.properties.movedNodes) {
          newWay.properties.movedNodes = []
        }

        if (!newWay.properties.movedNodes.includes(node.properties.id)) {
          newWay.properties.movedNodes.push(node.properties.id)
        }

        modifiedSharedWays.push(newWay)
      })
      break

    case 'DELETE':
      sharedWays.forEach(oldWay => {
        const newWay = _cloneDeep(oldWay)
        const indexOfNodeInWay = node.properties.ways[oldWay.properties.id.split('/')[1]] || node.properties.ways[oldWay.properties.id]
        if (newWay.geometry.type === 'LineString') {
          newWay.geometry.coordinates.splice(indexOfNodeInWay, 1)
          // TODO: remove the node from ndrefs
        }

        if (newWay.geometry.type === 'Polygon') {
          newWay.geometry.coordinates[0].splice(indexOfNodeInWay, 1)
          // TODO: remove the node from ndrefs
        }

        if (!newWay.properties.deletedNodes) {
          newWay.properties.deletedNodes = []
        }

        if (!newWay.properties.deletedNodes.includes(node.properties.id)) {
          newWay.properties.deletedNodes.push(node.properties.id)
        }

        modifiedSharedWays.push(newWay)
      })
      break

    case 'ADD':
      if (node.properties.edge) {
        const indexOfPointOnEdge = node.properties.index

        const pointOnEdgeAtIndex = node.properties.edge.geometry.coordinates[indexOfPointOnEdge]
        sharedWays.forEach(oldWay => {
          const newWay = _cloneDeep(oldWay)
          // find the index of this point on the way
          if (oldWay.geometry.type === 'LineString') {
            const indexOfNearestPoint = _findIndex(newWay.geometry.coordinates, (c) => {
              return _isEqual(c, pointOnEdgeAtIndex)
            })
            newWay.geometry.coordinates.splice(indexOfNearestPoint + 1, 0, node.geometry.coordinates)

            // add this way membership to the node
            node.properties.ways = { ...node.properties.ways }
            node.properties.ways[newWay.properties.id] = indexOfNearestPoint + 1

            // add this node to the way ndrefs
            newWay.properties.ndrefs.splice(indexOfNearestPoint + 1, 0, node.properties.id)
          }

          if (oldWay.geometry.type === 'Polygon') {
            const indexOfNearestPoint = _findIndex(newWay.geometry.coordinates[0], (c) => {
              return _isEqual(c, pointOnEdgeAtIndex)
            })
            newWay.geometry.coordinates[0].splice(indexOfNearestPoint + 1, 0, node.geometry.coordinates)
            node.properties.ways = { ...node.properties.ways }
            node.properties.ways[newWay.properties.id] = indexOfNearestPoint + 1
            newWay.properties.ndrefs.splice(indexOfNearestPoint + 1, 0, node.properties.id)
          }

          if (!newWay.properties.addedNodes) {
            newWay.properties.addedNodes = []
          }

          if (!newWay.properties.addedNodes.includes(node.properties.id)) {
            newWay.properties.addedNodes.push(node.properties.id)
          }

          modifiedSharedWays.push(newWay)
        })
      }
      break

    case 'MERGE':
      const sourceNode = node
      sharedWays.forEach(oldWay => {
        const newWay = _cloneDeep(oldWay)

        let indexOfSourceNode
        if (newWay.geometry.type === 'LineString') {
          indexOfSourceNode = _findIndex(newWay.properties.ndrefs, (r) => {
            return _isEqual(r, sourceNode.properties.id.split('/')[1])
          })
          // update the geometry
          newWay.geometry.coordinates.splice(indexOfSourceNode, 1, destinationNode.geometry.coordinates)
        }

        if (newWay.geometry.type === 'Polygon') {
          indexOfSourceNode = _findIndex(newWay.properties.ndrefs, (r) => {
            return _isEqual(r, sourceNode.properties.id.split('/')[1])
          })
          // update the geometry
          newWay.geometry.coordinates[0].splice(indexOfSourceNode, 1, destinationNode.geometry.coordinates)
        }

        // update the ndrefs of the way
        newWay.properties.ndrefs.splice(indexOfSourceNode, 1, destinationNode.properties.id)

        // add the ways membership for the destinationNode
        destinationNode.properties.ways[newWay.properties.id.split('/')[1]] = indexOfSourceNode

        if (!newWay.properties.mergedNodes) {
          newWay.properties.mergedNodes = []
        }

        if (!newWay.properties.mergedNodes.includes(destinationNode.properties.id)) {
          newWay.properties.mergedNodes.push(destinationNode.properties.id)
        }

        modifiedSharedWays.push(newWay)
      })
  }
  return modifiedSharedWays
}
