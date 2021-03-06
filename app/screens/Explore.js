import React from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components/native'
import { Platform } from 'react-native'
import MapboxGL from '@react-native-mapbox-gl/maps'
import { AndroidBackHandler } from 'react-navigation-backhandler'
import Config from 'react-native-config'
import { NavigationEvents } from 'react-navigation'
import _partition from 'lodash.partition'
import _difference from 'lodash.difference'
import _isEqual from 'lodash.isequal'

import {
  loadUserDetails
} from '../actions/account'

import {
  fetchData,
  setSelectedFeatures,
  mapBackPress,
  startAddPoint,
  setMapMode,
  updateVisibleBounds,
  setBasemap,
  setSelectedPhotos
} from '../actions/map'

import {
  setAddPointGeometry,
  addFeature,
  uploadEdits
} from '../actions/edit'

import {
  setSelectedNode,
  findNearestFeatures,
  resetWayEditing
} from '../actions/wayEditing'

import {
  setNotification
} from '../actions/notification'

import {
  startTrace,
  pauseTrace,
  unpauseTrace,
  endTrace
} from '../actions/traces'

import { bboxToTiles } from '../utils/bbox'
import Header from '../components/Header'
import MapOverlay from '../components/MapOverlay'
import MegaMenu from '../components/MegaMenu'
import AddPointOverlay from '../components/AddPointOverlay'
import LoadingOverlay from '../components/LoadingOverlay'
import ZoomToEdit from '../components/ZoomToEdit'
import getRandomId from '../utils/get-random-id'
import LocateUserButton from '../components/LocateUserButton'
import AuthMessage from '../components/AuthMessage'
import WayEditingOverlay from '../components/WayEditingOverlay'
import FeatureRelationWarning from '../components/FeatureRelationWarning'

import getUserLocation from '../utils/get-user-location'
import {
  getVisibleBounds,
  getVisibleFeatures,
  getZoom,
  isLoadingData,
  getIsTracing,
  getCurrentTraceGeoJSON,
  getCurrentTraceLength,
  getCurrentTraceStatus,
  getTracesGeojson,
  getPhotosGeojson,
  getVisibleTiles,
  getNearestGeojson
} from '../selectors'
import BasemapModal from '../components/BasemapModal'
import Icon from '../components/Collecticons'
import { colors } from '../style/variables'

import icons from '../assets/icons'
import { authorize } from '../services/auth'

import { modes, modeTitles } from '../utils/map-modes'

import { point as turfPoint, featureCollection } from '@turf/helpers'

let osmStyleURL = Config.MAPBOX_STYLE_URL || MapboxGL.StyleURL.Street
let satelliteStyleURL = Config.MAPBOX_SATELLITE_STYLE_URL || MapboxGL.StyleURL.Satellite

// fix asset URLs for Android
if (!osmStyleURL.includes(':/') && Platform.OS === 'android') {
  osmStyleURL = `asset://${osmStyleURL}`
}

if (!satelliteStyleURL.includes(':/') && Platform.OS === 'android') {
  satelliteStyleURL = `asset://${satelliteStyleURL}`
}

const Container = styled.View`
  flex: 1;
  display: flex;
  flex-flow: column nowrap;
`
const MainBody = styled.View`
  flex: 1;
  position: relative;
  background-color: white;
`
const MainHeader = styled(Header)`

`

const StyledMap = styled(MapboxGL.MapView)`
  flex: 1;
  width: 100%;
`

class Explore extends React.Component {
  static whyDidYouRender = true

  static navigationOptions = ({ navigation }) => {
    return {
      drawerLabel: 'Explore',
      drawerIcon: () => (
        <Icon
          name='compass'
          style={{ fontSize: 16, color: colors.primary }}
        />
      )
    }
  }

  constructor (props) {
    super(props)

    this.state = {
      androidPermissionGranted: false,
      isMapLoaded: false,
      userTrackingMode: MapboxGL.UserTrackingModes.Follow
    }
  }

  shouldComponentUpdate (nextProps) {
    return nextProps.navigation.isFocused()
  }

  componentWillUpdate (nextProps) {
    const { isConnected, visibleBounds, zoom } = this.props
    if (!isConnected && nextProps.isConnected) {
      // just went online
      this._fetchData(visibleBounds, zoom)
    }
  }

  onDidFinishRenderingMapFully = async () => {
    this.setState({
      isMapLoaded: true,
      clickableLayers: ['editedPois', 'pois', 'editedPolygons', 'editedLines',
        'buildings', 'roads', 'roadsLower', 'amenities',
        'railwayLine', 'waterLine', 'waterFill', 'leisure', 'landuse', 'photos', 'natural', 'allPolygons', 'allLines'],
      userTrackingMode: MapboxGL.UserTrackingModes.None
    })

    const visibleBounds = await this.mapRef.getVisibleBounds()
    const zoomLevel = await this.mapRef.getZoom()

    this.props.updateVisibleBounds(visibleBounds, zoomLevel)
  }

  onWillFocus = payload => {
    if (payload.action.params && payload.action.params.mode) {
      this.props.setMapMode(payload.action.params.mode)
    }
    // TODO: handle payload.actions.params.message
  }

  onDidFocus = () => {
    const { requiresPreauth } = this.props

    if (!requiresPreauth) {
      this.forceUpdate()
    }

    // When camera is undefined, this is the first time this screen is shown and
    // the camera should be set to the user location.
    if (!this.state.camera) {
      this.locateUser()
    }
  }

  onWillStartLoadingMap = () => {
    this.setState({
      isMapLoaded: false
    })

    if (
      Platform.OS === 'android' &&
      Platform.Version >= 23 &&
      !this.state.androidPermissionGranted
    ) {
      this.locateUser()
    }
  }

  onDidFailLoadingMap = err => {
    console.log('onDidFailLoadingMap', err)
  }

  _fetchData (visibleBounds, zoomLevel) {
    // fetch new data only if zoom is greater than 16
    if (zoomLevel >= 16) {
      this.props.fetchData(visibleBounds)
    }
  }

  onRegionDidChange = async (evt) => {
    const { properties: { visibleBounds, zoomLevel } } = evt
    const oldBounds = this.props.visibleBounds
    const { mode } = this.props
    // if in way editing mode, find nearest
    if (mode === modes.ADD_WAY || mode === modes.EDIT_WAY) {
      const center = await this.mapRef.getCenter()
      const node = turfPoint(center)
      this.props.findNearestFeatures(node)
    }

    if (oldBounds && oldBounds.length) {
      const oldTiles = bboxToTiles(oldBounds)
      const currentTiles = bboxToTiles(visibleBounds)
      if (_difference(oldTiles, currentTiles).length === 0) return
    }
    this.props.updateVisibleBounds(visibleBounds, zoomLevel)
  }

  onPress = async (e) => {
    const { mode } = this.props

    const screenBbox = this.getBoundingBox([e.properties.screenPointX, e.properties.screenPointY])

    if (mode === modes.ADD_WAY || mode === modes.EDIT_WAY) {
      const { features } = await this.mapRef.queryRenderedFeaturesInRect(screenBbox, null, ['editingWayMemberNodes'])
      this.props.setSelectedNode(features[0])
    } else {
      this.loadFeaturesAtPoint(screenBbox)
    }
  }

  async locateUser () {
    try {
      const userLocation = await getUserLocation()
      if (userLocation.hasOwnProperty('coords')) {
        // Create camera object from user location
        const camera = {
          centerCoordinate: [userLocation.coords.longitude, userLocation.coords.latitude],
          zoomLevel: 18
        }

        // Set map and component state
        this.cameraRef && this.cameraRef.setCamera(camera)
        this.setState({ camera })
      }
    } catch (error) {
      console.log('error fetching user location', error)
    }
  }

  async loadFeaturesAtPoint (rect) {
    try {
      const { features } = await this.mapRef.queryRenderedFeaturesInRect(rect, null, this.state.clickableLayers)
      const [ photos, osmFeatures ] = _partition(features, (f) => { return f.properties.type === 'photo' })
      const { selectedPhotos, selectedFeatures } = this.props
      if (!_isEqual(osmFeatures, selectedFeatures)) {
        this.props.setSelectedFeatures(osmFeatures)
      }
      if (!_isEqual(photos, selectedPhotos)) {
        this.props.setSelectedPhotos(photos)
      }
    } catch (err) {
      console.log('failed getting features', err)
    }
  }

  getBoundingBox (screenCoords) {
    const maxX = screenCoords[0] + 3
    const minX = screenCoords[0] - 3
    const maxY = screenCoords[1] + 3
    const minY = screenCoords[1] - 3
    return [maxY, maxX, minY, minX]
  }

  getFeatureType (feature) {
    return feature.id.split('/')[0]
  }

  onAddButtonPress = () => {
    this.props.startAddPoint()
  }

  onAddConfirmPress = async () => {
    const center = await this.mapRef.getCenter()
    const featureId = `node/${getRandomId()}`
    const feature = {
      type: 'Feature',
      id: featureId,
      geometry: {
        type: 'Point',
        coordinates: center
      },
      properties: {
        id: featureId,
        version: 1
      }
    }

    this.props.navigation.navigate('SelectFeatureType', { feature })
  }

  onEditConfirmPress = async () => {
    const feature = this.props.navigation.state.params.feature
    const newCoords = await this.mapRef.getCenter()
    this.props.navigation.navigate('EditFeatureDetail', { feature, newCoords })
  }

  onBackButtonPress = () => {
    const { mode, navigation } = this.props

    if (mode === modes.EXPLORE) { // let default back handling happen when in Explore mode
      return false
    }

    if (mode === modes.ADD_WAY || mode === modes.EDIT_WAY) {
      this.props.resetWayEditing()
      this.props.setMapMode(modes.EXPLORE)

      // remove the feature from the navigation
      navigation.setParams({
        feature: null
      })
    }

    this.props.mapBackPress()
    return true
  }

  renderZoomToEdit () {
    const { zoom } = this.props

    if (!zoom || zoom >= 16) return null

    return (
      <ZoomToEdit onPress={() => {
        this.cameraRef.zoomTo(16.5)
      }} />
    )
  }

  getBackButton = () => {
    const { navigation, mode } = this.props
    const useBackButtonPress = (
      mode === modes.ADD_POINT ||
      mode === modes.EDIT_POINT ||
      mode === modes.ADD_WAY ||
      mode === modes.EDIT_WAY
    )

    switch (true) {
      case navigation.getParam('back'):
        return navigation.getParam('back')
      case useBackButtonPress:
        return this.onBackButtonPress
      case mode === modes.OFFLINE_TILES:
        return 'OfflineMaps'
      default:
        return false
    }
  }

  getTitle = () => {
    const { navigation, mode } = this.props
    const title = navigation.getParam('title') || modeTitles[mode]
    if (!title) return 'Observe'
    return title
  }

  onRecordPress = () => {
    const { currentTraceStatus, startTrace, pauseTrace, unpauseTrace } = this.props
    switch (currentTraceStatus) {
      case 'none':
        startTrace()
        break
      case 'paused':
        unpauseTrace()
        break
      case 'recording':
        pauseTrace()
        break
      default:
        console.error('invalid current trace status')
    }
  }

  renderAuthPrompt () {
    return (
      <AuthMessage onPress={async () => {
        await authorize()
        await this.props.loadUserDetails()
        this.locateUser()
      }} />
    )
  }

  async getMapCenter () {
    return this.mapRef.getCenter()
  }

  renderOverlay () {
    const { navigation, geojson, mode, currentTraceStatus } = this.props

    if (mode === modes.OFFLINE_TILES) {
      return null
    }

    if (mode === modes.ADD_POINT) {
      return <AddPointOverlay
        onAddConfirmPress={this.onAddConfirmPress}
      />
    }

    if (mode === modes.EDIT_POINT) {
      return <AddPointOverlay
        onAddConfirmPress={this.onEditConfirmPress}
      />
    }

    if (mode === modes.ADD_WAY || mode === modes.EDIT_WAY) {
      return <WayEditingOverlay
        mode={mode}
        navigation={navigation}
        getMapCenter={async () => {
          return this.getMapCenter()
        }}
      />
    }

    // if not in explicit mode, render default MapOverlay

    return (
      <>
        <MapOverlay
          features={geojson.features}
          onAddButtonPress={this.onAddButtonPress}
          navigation={navigation}
        />
        <MegaMenu
          onCameraPress={() => navigation.navigate('CameraScreen', { previousScreen: 'Explore', feature: null })}
          onRecordPress={() => this.onRecordPress()}
          onWayPress={() => { this.props.setMapMode(modes.ADD_WAY) }}
          onPointPress={() => { this.onAddButtonPress() }}
          recordStatus={currentTraceStatus}
        />
      </>
    )
  }

  renderRelationWarning () {
    const { featuresInRelation, selectedFeatures } = this.props
    if (!featuresInRelation || !featuresInRelation.length) return null
    if (!selectedFeatures || !selectedFeatures.length) return null

    // TODO: consider only showing this on ADD_WAY or EDIT_WAY modes
    const feature = selectedFeatures.find((feature) => {
      return featuresInRelation.includes(feature.id)
    })

    if (!feature) return null

    return (
      <FeatureRelationWarning id={feature.id} />
    )
  }

  render () {
    const {
      navigation,
      geojson,
      selectedFeatures,
      editsGeojson,
      mode,
      currentTrace,
      isConnected,
      requiresPreauth,
      tracesGeojson,
      style,
      photosGeojson,
      selectedPhotos,
      editingWayMemberNodes,
      currentWayEdit,
      selectedNode,
      nearestFeatures,
      modifiedSharedWays,
      deletedNodes
    } = this.props
    let selectedFeatureIds = null
    let selectedPhotoIds = null

    if (selectedFeatures && selectedFeatures.length) {
      selectedFeatureIds = {
        'nodes': ['match', ['get', 'id'], [], true, false],
        'ways': ['match', ['get', 'id'], [], true, false]
      }
      selectedFeatures.reduce((selectedFeatureIds, currentFeature) => {
        this.getFeatureType(currentFeature) === 'node' ? selectedFeatureIds.nodes[2].push(currentFeature.id) : selectedFeatureIds.ways[2].push(currentFeature.id)
        return selectedFeatureIds
      }, selectedFeatureIds)
    }

    if (selectedPhotos && selectedPhotos.length) {
      selectedPhotoIds = ['match', ['get', 'id'], [], true, false]
      selectedPhotos.reduce((selectedPhotoIds, photo) => {
        selectedPhotoIds[2].push(photo.properties.id)
        return selectedPhotoIds
      }, selectedPhotoIds)
    }

    let filteredFeatureIds = null
    if (editsGeojson.features.length) {
      filteredFeatureIds = {
        'nodes': ['match', ['get', 'id'], [], false, true],
        'ways': ['match', ['get', 'id'], [], false, true]
      }

      editsGeojson.features.reduce((filteredFeatureIds, feature) => {
        this.getFeatureType(feature) === 'node' ? filteredFeatureIds.nodes[2].push(feature.id) : filteredFeatureIds.ways[2].push(feature.id)
        return filteredFeatureIds
      }, filteredFeatureIds)
    }

    let editingWayDeletedMemberNodes = ['match', ['get', 'id'], [], false, true]
    if (deletedNodes && deletedNodes.length) {
      editingWayDeletedMemberNodes[2] = deletedNodes
    }

    let styleURL
    switch (this.props.baseLayer) {
      case 'satellite':
        styleURL = satelliteStyleURL
        break

      default:
        styleURL = osmStyleURL
    }

    let showLoadingIndicator = null
    if (this.props.loadingData) {
      showLoadingIndicator = (
        <LoadingOverlay />
      )
    }

    const filters = {
      allPolygons: [
        'all',
        ['!', ['has', 'building']],
        ['!', ['has', 'amenity']],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      allLines: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['!', ['has', 'waterway']],
        ['!', ['has', 'railway']],
        ['!', ['has', 'highway']]
      ],
      allRoads: [
        'all',
        ['==', ['geometry-type'], 'LineString']
      ],
      railwayLine: [
        'all',
        ['has', 'railway'],
        ['==', ['geometry-type'], 'LineString']
      ],
      waterLine: [
        'all',
        ['has', 'waterway'],
        ['==', ['geometry-type'], 'LineString']
      ],
      waterFill: [
        'all',
        ['has', 'waterway'],
        ['!', ['has', 'building']],
        ['!', ['has', 'amenity']],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      coastlines: [
        'match',
        ['get', 'natural'],
        'coastline',
        true, false
      ],
      amenities: [
        'all',
        ['has', 'amenity'],
        ['!', ['has', 'building']],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      buildings: [
        'all',
        ['has', 'building'],
        filteredFeatureIds && filteredFeatureIds.ways[2].length ? filteredFeatureIds.ways : ['match', ['get', 'id'], [''], false, true]
      ],
      leisure: [
        'all',
        ['has', 'leisure'],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      landuse: [
        'all',
        ['has', 'landuse'],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      boundaries: [
        'all',
        ['has', 'boundary']
      ],
      natural: [
        'all',
        ['has', 'natural'],
        [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon']
        ]
      ],
      iconHalo: [
        'all',
        [
          '==',
          ['geometry-type'], 'Point'
        ],
        filteredFeatureIds && filteredFeatureIds.nodes[2].length ? filteredFeatureIds.nodes : ['match', ['get', 'id'], [''], false, true]
      ],
      iconHaloSelected: [
        'all',
        [
          '==',
          ['geometry-type'], 'Point'
        ],
        selectedFeatureIds && selectedFeatureIds.nodes[2].length ? selectedFeatureIds.nodes : ['==', ['get', 'id'], ''],
        filteredFeatureIds && filteredFeatureIds.nodes[2].length ? filteredFeatureIds.nodes : ['match', ['get', 'id'], [''], false, true]
      ],
      pois: [
        'all',
        [
          'has', 'icon'
        ],
        ['==', ['geometry-type'], 'Point'],
        filteredFeatureIds && filteredFeatureIds.nodes[2].length ? filteredFeatureIds.nodes : ['match', ['get', 'id'], [''], false, true]
      ],
      selectedFeatures: [
        'all',
        selectedFeatureIds && selectedFeatureIds.ways[2].length ? selectedFeatureIds.ways : ['==', ['get', 'id'], ''],
        filteredFeatureIds && filteredFeatureIds.ways[2].length ? filteredFeatureIds.ways : ['match', ['get', 'id'], [''], false, true]
      ],
      editedPolygons: ['==', ['geometry-type'], 'Polygon'],
      editedLines: ['==', ['geometry-type'], 'LineString'],
      editedPois: [
        'all',
        ['has', 'icon'],
        ['==', ['geometry-type'], 'Point']
      ],
      editedIconHaloSelected: [
        'all',
        [
          '==',
          ['geometry-type'], 'Point'
        ],
        selectedFeatureIds && selectedFeatureIds.nodes[2].length ? selectedFeatureIds.nodes : ['==', ['get', 'id'], '']
      ],
      photosHaloSelected: selectedPhotoIds && selectedPhotoIds.length ? selectedPhotoIds : ['==', ['get', 'id'], ''],
      nodeHalo: [
        'all',
        [
          '==',
          ['geometry-type'], 'Point'
        ]
      ],
      nodeHaloSelected: [
        'all',
        [
          '==',
          ['geometry-type'], 'Point'
        ],
        selectedNode && selectedNode.properties.id ? ['match', ['get', 'id'], [selectedNode.properties.id], true, false] : ['==', ['get', 'id'], ''],
        deletedNodes && deletedNodes.length ? editingWayDeletedMemberNodes : ['match', ['get', 'id'], [''], false, true]
      ],
      editingWayMemberNodes: deletedNodes && deletedNodes.length ? editingWayDeletedMemberNodes : ['match', ['get', 'id'], [''], false, true]
    }

    return (
      <AndroidBackHandler onBackPress={() => this.onBackButtonPress()}>
        <NavigationEvents
          onWillFocus={this.onWillFocus}
          onDidFocus={this.onDidFocus}
          onWillBlur={payload => {
            if (payload.state.params && payload.state.params.mode === modes.OFFLINE_TILES) {
              // reset params once this screen has been used in bbox mode
              navigation.setParams({
                back: null,
                mode: modes.EXPLORE,
                title: null,
                actions: null
              })

              // reset map mode
              this.props.setMapMode(modes.EXPLORE)
            }
          }}
        />
        <Container>
          <MainHeader
            actions={navigation.getParam('actions', [])}
            back={this.getBackButton()}
            navigation={navigation}
            title={this.getTitle()}
          />
          <MainBody>
            {
              (requiresPreauth && isConnected)
                ? this.renderAuthPrompt()
                : (
                  <StyledMap
                    styleURL={styleURL}
                    ref={(ref) => { this.mapRef = ref }}
                    onDidFinishRenderingMapFully={this.onDidFinishRenderingMapFully}
                    onWillStartLoadingMap={this.onWillStartLoadingMap}
                    onDidFailLoadingMap={this.onDidFailLoadingMap}
                    onRegionDidChange={this.onRegionDidChange}
                    regionDidChangeDebounceTime={10}
                    onPress={this.onPress}
                    // compassViewPosition={0} requires latest version of react-native-mapbox-gl
                    compassViewMargins={{ x: 20, y: 148 }}
                  >
                    <MapboxGL.Camera
                      zoomLevel={12}
                      maxZoomLevel={19}
                      defaultSettings={{
                        centerCoordinate: [0, 0],
                        zoomLevel: 12
                      }}
                      animationDuration={0}
                      animationMode={'moveTo'}
                      ref={(ref) => { this.cameraRef = ref }}
                    />
                    <MapboxGL.UserLocation
                      minDisplacement={5}
                    />
                    <MapboxGL.Images images={icons} />
                    <MapboxGL.ShapeSource id='geojsonSource' shape={geojson}>
                      <MapboxGL.LineLayer id='roadsHighlight' filter={filters.allRoads} style={style.osm.lineHighlight} minZoomLevel={16} />
                      <MapboxGL.LineLayer id='roads' filter={filters.allRoads} style={style.osm.highways} minZoomLevel={16} />
                      {/* <MapboxGL.LineLayer id='boundaries' filter={filters.boundaries} style={style.osm.boundaries} minZoomLevel={16} /> */}
                      <MapboxGL.LineLayer id='railwayLine' filter={filters.railwayLine} style={style.osm.railwayLine} minZoomLevel={16} />
                      {/* <MapboxGL.LineLayer id='coastlines' filter={filters.coastlines} style={style.osm.coastline} minZoomLevel={16} /> */}
                      <MapboxGL.LineLayer id='waterLine' filter={filters.waterLine} style={style.osm.waterLine} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='waterFill' filter={filters.waterFill} style={style.osm.waterFill} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='natural' filter={filters.natural} style={style.osm.natural} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='landuse' filter={filters.landuse} style={style.osm.landuse} minZoomLevel={12} />
                      <MapboxGL.FillLayer id='leisure' filter={filters.leisure} style={style.osm.leisure} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='allPolygons' filter={filters.allPolygons} style={style.osm.polygons} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='amenities' filter={filters.amenities} style={style.osm.amenities} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='buildings' filter={filters.buildings} style={style.osm.buildings} minZoomLevel={16} />
                      <MapboxGL.LineLayer id='allLines' filter={filters.allLines} style={style.osm.lines} minZoomLevel={16} />
                      <MapboxGL.LineLayer id='selectedFeatures' filter={filters.selectedFeatures} style={style.osm.selectedFeatures.lines} minZoomLevel={16} />
                      <MapboxGL.CircleLayer id='iconHalo' style={style.osm.iconHalo} minZoomLevel={16} filter={filters.iconHalo} />
                      <MapboxGL.CircleLayer id='iconHaloSelected' style={style.osm.iconHaloSelected} minZoomLevel={16} filter={filters.iconHaloSelected} />
                      <MapboxGL.SymbolLayer id='pois' style={style.osm.icons} filter={filters.pois} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='editGeojsonSource' shape={editsGeojson}>
                      <MapboxGL.FillLayer id='editedPolygons' filter={filters.editedPolygons} style={style.osm.editedPolygons} minZoomLevel={16} />
                      <MapboxGL.CircleLayer id='editedIconHalo' style={style.osm.iconEditedHalo} minZoomLevel={16} filter={filters.editedPois} />
                      <MapboxGL.CircleLayer id='editedIconHaloSelected' style={style.osm.iconHaloSelected} minZoomLevel={16} filter={filters.editedIconHaloSelected} />
                      <MapboxGL.LineLayer id='editedLines' filter={filters.editedLines} style={style.osm.editedLines} minZoomLevel={16} />
                      <MapboxGL.SymbolLayer id='editedPois' style={style.osm.icons} filter={filters.editedPois} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='tracesGeojsonSource' shape={tracesGeojson}>
                      <MapboxGL.LineLayer id='traces' style={style.traces.traces} minZoomLevel={16} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='currentTraceGeojsonSource' shape={currentTrace}>
                      <MapboxGL.LineLayer id='currentTrace' style={style.traces.traces} minZoomLevel={16} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='photoGeojsonSource' shape={photosGeojson}>
                      <MapboxGL.CircleLayer id='photosHaloSelected' style={style.photos.photoIconSelected} filter={filters.photosHaloSelected} minZoomLevel={16} />
                      <MapboxGL.CircleLayer id='photosHalo' style={style.photos.photoIconHalo} minZoomLevel={16} />
                      <MapboxGL.SymbolLayer id='photos' style={style.photos.photoIcon} minZoomLevel={16} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='currentWayEdit' shape={currentWayEdit}>
                      <MapboxGL.LineLayer id='currentWayLine' style={style.osm.editingWay.lines} minZoomLevel={16} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='nearestFeatures' shape={nearestFeatures}>
                      <MapboxGL.LineLayer id='nearestEdges' style={style.osm.editingWay.nearestFeatures.lines} minZoomLevel={16} />
                      <MapboxGL.CircleLayer id='nearestNodes' minZoomLevel={16} style={style.osm.editingWay.nearestFeatures.nodes} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='editingWayMemberNodesSource' shape={editingWayMemberNodes}>
                      <MapboxGL.CircleLayer id='editingWayMemberNodes' style={style.osm.editingWay.nodes} minZoomLevel={16} filter={filters.editingWayMemberNodes} />
                      <MapboxGL.CircleLayer id='editingWayMemberNodesHalo' style={style.osm.iconHaloSelected} minZoomLevel={16} filter={filters.nodeHaloSelected} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource id='modifiedSharedWays' shape={modifiedSharedWays}>
                      <MapboxGL.LineLayer id='modifiedLines' style={style.osm.editedLines} minZoomLevel={16} />
                      <MapboxGL.FillLayer id='modifiedPolygons' style={style.osm.editedPolygons} minZoomLevel={16} />
                    </MapboxGL.ShapeSource>
                  </StyledMap>
                )
            }
            {/* should hide this entire element when not in loading state */}
            { showLoadingIndicator }
            <LocateUserButton onPress={() => this.locateUser()} />
            <BasemapModal onChange={this.props.setBasemap} />
            {mode !== modes.OFFLINE_TILES && this.renderZoomToEdit()}
            { this.renderRelationWarning() }
          </MainBody>
          { this.renderOverlay() }
        </Container>
      </AndroidBackHandler>
    )
  }
}

const mapStateToProps = (state) => {
  const { userDetails } = state.account
  const { mode } = state.map

  const currentWayEdit = {
    type: 'FeatureCollection',
    features: []
  }

  let editingWayMemberNodes = featureCollection([])

  // Don't use currentWayEdit for displaying edits to existing ways
  // That happens in modifiedSharedWays
  if (
    mode === modes.ADD_WAY &&
    state.wayEditingHistory.present.way &&
    state.wayEditingHistory.present.way.nodes &&
    state.wayEditingHistory.present.way.nodes.length
  ) {
    const coordinates = state.wayEditingHistory.present.way.nodes.map((point) => {
      return point.geometry.coordinates
    })
    currentWayEdit.features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: state.wayEditingHistory.present.way.properties
    })
  }

  if (state.wayEditingHistory.present.way &&
    state.wayEditingHistory.present.way.nodes &&
    state.wayEditingHistory.present.way.nodes.length
  ) {
    editingWayMemberNodes = featureCollection(state.wayEditingHistory.present.way.nodes)
  }

  return {
    geojson: getVisibleFeatures(state),
    isTracing: getIsTracing(state),
    currentTrace: getCurrentTraceGeoJSON(state),
    currentTraceLength: getCurrentTraceLength(state),
    currentTraceStatus: getCurrentTraceStatus(state),
    isConnected: state.network.isConnected,
    selectedFeatures: state.map.selectedFeatures || false,
    editingWayMemberNodes,
    mode: state.map.mode,
    edits: state.edit.edits,
    editsGeojson: state.edit.editsGeojson,
    loadingData: isLoadingData(state),
    visibleBounds: getVisibleBounds(state),
    zoom: getZoom(state),
    baseLayer: state.map.baseLayer,
    isAuthorized: state.authorization.isAuthorized,
    userDetails,
    requiresPreauth: Config.PREAUTH_URL && !userDetails,
    tracesGeojson: getTracesGeojson(state),
    overlays: state.map.overlays,
    style: state.map.style,
    photosGeojson: getPhotosGeojson(state),
    selectedPhotos: state.map.selectedPhotos,
    visibleTiles: getVisibleTiles(state),
    currentWayEdit,
    selectedNode: state.wayEditing.selectedNode,
    nearestFeatures: getNearestGeojson(state),
    modifiedSharedWays: featureCollection(state.wayEditingHistory.present.modifiedSharedWays),
    featuresInRelation: state.map.featuresInRelation,
    deletedNodes: state.wayEditingHistory.present.deletedNodes
  }
}

const mapDispatchToProps = {
  fetchData,
  setSelectedFeatures,
  startAddPoint,
  mapBackPress,
  setMapMode,
  setAddPointGeometry,
  addFeature,
  updateVisibleBounds,
  uploadEdits,
  setBasemap,
  setNotification,
  startTrace,
  endTrace,
  pauseTrace,
  unpauseTrace,
  loadUserDetails,
  setSelectedPhotos,
  setSelectedNode,
  findNearestFeatures,
  resetWayEditing
}

export default connect(mapStateToProps, mapDispatchToProps)(Explore)
