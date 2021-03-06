import React from 'react'
import styled from 'styled-components/native'
import { TouchableHighlight, Animated, Platform } from 'react-native'
import { connect } from 'react-redux'
import createWayFeature from '../utils/create-way-feature'

import getRandomId from '../utils/get-random-id'

import {
  editWayEnter,
  resetWayEditing
} from '../actions/wayEditing'

import {
  addNode,
  moveSelectedNode,
  deleteSelectedNode,
  mergeSelectedNode
} from '../actions/wayEditingHistory'

import { undo, redo } from '../actions/undoable'

import { showRecordingHeader } from '../selectors'

import { colors } from '../style/variables'
import Icon from './Collecticons'

import CrossHairOverlay from './CrosshairOverlay'
import FeatureRelationErrorDialog from './FeatureRelationErrorDialog'

import { modes } from '../utils/map-modes'
import { isNewId } from '../utils/utils'

const Container = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
`

const MenuWrapper = styled.View`
  flex: 1;
  position: absolute;
  flex-direction: row;
  justify-content: space-between;
  background-color: white;
  bottom: 0;
  width: 100%;
  padding-left: 16;
  padding-right: 16;
  padding-bottom: 16;
  padding-top: 8;
  elevation: 1;
  shadowOffset: { width: 5, height: -5 };
  shadowColor: ${colors.baseMuted};
  shadowOpacity: 0.5;
  shadowRadius: 10;
`

const AddNodeButton = styled.TouchableHighlight`
  border-radius: 100;
  width: 56;
  height: 56;
  background-color: white;
  justify-content: center;
  align-items: center;
  elevation: 3;
  shadow-color: ${colors.primary};
  shadow-opacity: 0.4;
  shadow-offset: 0px 0px;
  shadowRadius: 3;
  margin-top: -16;
`

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableHighlight)

const ActionButton = styled(AnimatedTouchable)`
  width: 48;
  height: 48;
  justify-content: center;
  align-items: center;
  border-radius: 100;
`

const ActionButtonIcon = styled(Icon)`
  color: ${({ disabled }) => !disabled ? colors.primary : colors.muted}
`

const CompleteWayButton = styled.TouchableHighlight`
  border-radius: 100;
  width: 56;
  height: 56;
  background-color: ${colors.primary};
  elevation: 2;
  shadow-color: ${colors.base};
  shadow-opacity: 0.7;
  shadow-offset: 0px 0px;
  bottom: 100;
  right: 16;
  position: absolute;
  justify-content: center;
  align-items: center;
`

class WayEditingOverlay extends React.Component {
  state = {
    featureInRelationDialogVisible: false,
    featureInRelationDialogDescription: null
  }

  componentDidMount () {
    const editingFeature = this.props.navigation.getParam('feature')
    const feature = editingFeature || createWayFeature()
    this.props.editWayEnter(feature)
  }

  onDeleteNodePress () {
    const { featuresInRelation, wayEditing } = this.props
    const { selectedNode } = wayEditing

    if (!selectedNode) return null

    const nodeWays = Object.keys(selectedNode.properties.ways)
    if (featuresInRelation && featuresInRelation.length) {
      const feature = nodeWays.find((wayId) => {
        return featuresInRelation.includes(`way/${wayId}`)
      })

      if (feature) {
        this.showFeatureRelationDialog('Deleting nodes in ways that are in a relation is not currently supported')
        return
      }
    }

    this.props.deleteSelectedNode(selectedNode)
  }

  onUndoPress () {
    this.props.undo()
  }

  async onAddNodePress () {
    const { wayEditing, getMapCenter } = this.props
    const { nearestFeatures } = wayEditing
    let point
    if (nearestFeatures && nearestFeatures.nearestNode) {
      point = nearestFeatures.nearestNode
    } else {
      const id = getRandomId()
      point = {
        type: 'Feature',
        id: id,
        geometry: {
          type: 'Point',
          coordinates: await getMapCenter()
        },
        properties: {
          id: id
        }
      }
    }

    this.props.addNode(point)
  }

  onRedoPress () {
    this.props.redo()
  }

  async onMoveNodePress () {
    const { featuresInRelation, wayEditing, getMapCenter } = this.props
    const { nearestFeatures, selectedNode } = wayEditing

    if (!selectedNode) return null

    const center = await getMapCenter()

    if (nearestFeatures && nearestFeatures.nearestNode) {
      const nodeWays = Object.keys(wayEditing.selectedNode.properties.ways)
      const nearestNodeWays = Object.keys(nearestFeatures.nearestNode.properties.ways)
      const allWays = nodeWays.concat(nearestNodeWays)

      if (featuresInRelation && featuresInRelation.length) {
        const feature = allWays.find((wayId) => {
          const id = wayId.indexOf('way/') === -1 ? `way/${wayId}` : wayId
          return featuresInRelation.includes(id)
        })

        if (feature) {
          this.showFeatureRelationDialog('Merging nodes in ways that are in a relation is not currently supported')
          return
        }
      }

      if (isNewId(selectedNode.properties.id)) {
        this.props.deleteSelectedNode(selectedNode)
        this.props.addNode(nearestFeatures.nearestNode)
      }
      this.props.mergeSelectedNode(selectedNode, nearestFeatures.nearestNode)
    } else {
      this.props.moveSelectedNode(selectedNode, center)
    }
  }

  onCompleteWayPress () {
    const { wayEditingHistory } = this.props
    const { present } = wayEditingHistory

    if (this.props.mode === modes.EDIT_WAY && present.way) {
      const { properties } = present.way

      let feature
      if (present.modifiedSharedWays.length) {
        feature = present.modifiedSharedWays.find((way) => {
          return way.properties.id === properties.id
        })
      } else {
        feature = present.way
      }

      const oldFeature = present.oldFeature

      console.log('edited feature', JSON.stringify(feature))
      this.props.navigation.navigate('EditFeatureDetail', { feature: feature, oldFeature: oldFeature })
    }

    if (this.props.mode === modes.ADD_WAY && this.props.wayEditingHistory.present.way) {
      const feature = createWayFeature(this.props.wayEditingHistory.present.way.nodes)
      console.log('edited feature', JSON.stringify(feature))
      // this.props.resetWayEditing()
      this.props.navigation.navigate('SelectFeatureType', { feature })
    }
  }

  showFeatureRelationDialog (description) {
    this.setState({
      featureInRelationDialogVisible: 'visible',
      featureInRelationDialogDescription: description
    })
  }

  hideFeatureRelationDialog () {
    this.setState({
      featureInRelationDialogVisible: false,
      featureInRelationDialogDescription: null
    })
  }

  renderFeatureRelationDialog () {
    if (!this.state.featureInRelationDialogVisible) return null
    return (
      <FeatureRelationErrorDialog
        visible={this.state.featureInRelationDialogVisible}
        description={this.state.featureInRelationDialogDescription}
        confirm={() => {
          this.hideFeatureRelationDialog()
        }}
      />
    )
  }

  render () {
    const { wayEditing, wayEditingHistory, mode } = this.props
    const { nearestFeatures } = wayEditing

    const canDeleteOrMove = wayEditing.selectedNode
    const hasPast = wayEditingHistory.past.length > 0
    const hasFuture = wayEditingHistory.future.length > 0
    let canAdd = true
    if (mode === modes.ADD_WAY) {
      canAdd = true
    }

    // in the edit way mode, don't allow adding stray nodes.
    // nodes should only be added to existing ways
    if (mode === modes.EDIT_WAY && (!nearestFeatures || !nearestFeatures.nearestNode)) {
      canAdd = false
    }

    return (
      <Container pointerEvents={Platform.OS === 'ios' ? 'box-none' : 'auto'}>
        <CrossHairOverlay isRecording={this.props.isRecording} />

        <CompleteWayButton onPress={() => this.onCompleteWayPress()} underlayColor={colors.base}>
          <Icon name='tick' size={20} color='#FFFFFF' />
        </CompleteWayButton>

        <MenuWrapper>
          <ActionButton
            onPress={() => canDeleteOrMove && this.onDeleteNodePress()}
            underlayColor='#E4E6F2'
          >
            <ActionButtonIcon
              name='trash-bin'
              size={24}
              disabled={!canDeleteOrMove}
            />
          </ActionButton>
          <ActionButton
            onPress={() => hasPast && this.onUndoPress()}
            underlayColor='#E4E6F2'
          >
            <ActionButtonIcon
              name='arrow-semi-spin-ccw'
              size={24}
              disabled={!hasPast}
            />
          </ActionButton>
          <AddNodeButton
            onPress={() => canAdd && this.onAddNodePress()}
            underlayColor='#E4E6F2'
          >
            <ActionButtonIcon
              name='plus'
              size={24}
              color={colors.primary}
              disabled={!canAdd}
            />
          </AddNodeButton>
          <ActionButton
            onPress={() => hasFuture && this.onRedoPress()}
            underlayColor='#E4E6F2'
          >
            <ActionButtonIcon
              name='arrow-semi-spin-cw'
              size={24}
              disabled={!hasFuture}
            />
          </ActionButton>
          <ActionButton
            onPress={() => canDeleteOrMove && this.onMoveNodePress()}
            underlayColor='#E4E6F2'
          >
            <ActionButtonIcon
              name='arrow-move'
              size={24}
              disabled={!canDeleteOrMove}
            />
          </ActionButton>
        </MenuWrapper>
        <FeatureRelationErrorDialog
          visible={this.state.featureInRelationDialogVisible}
          description={this.state.featureInRelationDialogDescription}
          confirm={() => {
            this.hideFeatureRelationDialog()
          }}
        />
      </Container>
    )
  }
}

const mapStateToProps = (state) => {
  const { wayEditing, wayEditingHistory } = state

  return {
    wayEditing,
    wayEditingHistory,
    mode: state.map.mode,
    featuresInRelation: state.map.featuresInRelation,
    selectedFeatures: state.map.selectedFeatures || false,
    isRecording: showRecordingHeader(state)
  }
}

const mapDispatchToProps = {
  resetWayEditing,
  editWayEnter,
  addNode,
  moveSelectedNode,
  deleteSelectedNode,
  mergeSelectedNode,
  undo,
  redo
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(WayEditingOverlay)
