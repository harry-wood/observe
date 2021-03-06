import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Text,
  Platform,
  Dimensions
} from 'react-native'
import styled from 'styled-components/native'
import { colors } from '../style/variables'
import getTaginfo from '../utils/get-taginfo'
import BottomDrawer from 'rn-bottom-drawer'
import formatDate from '../utils/format-date'

const win = Dimensions.get('window')

const Container = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
`

const Drawer = styled(BottomDrawer)`
  margin-left: 16;
  margin-right: -96;
`

const FeatureListWrapper = styled.View`
  padding-top: 12;
  padding-left: 16;
  padding-right: 16;
  align-self: stretch;
  border-top-left-radius: 4;
  border-top-right-radius: 4;
  shadow-color: #CECDCD;
  shadow-radius: 3;
  shadow-opacity: 5;
  elevation: 2;
  background-color: #ffffff;
  width: ${win.width - 96};
`

const ItemList = styled.SectionList`
  height: 400;
  align-self: stretch;
`

const Feature = styled.TouchableOpacity`
  padding-bottom: 12;
  padding-top: 12;
  border-bottom-width: 0.5;
  border-bottom-color: ${colors.primary};
  flex: 1;
  flex-shrink: 0;
  flex-grow: 0;
  flex-direction: row;
`

const FeatureText = styled.View``

const NameText = styled.Text`
  font-weight: bold;
  font-size: 20;
`

const BoldText = styled.Text`
  font-weight: bold;
`

const Grabber = styled.View`
  width: 48;
  margin-bottom: 8;
  border-bottom-width: 5;
  border-bottom-color: ${colors.muted};
  align-self: center;
`

class MapOverlay extends Component {
  renderFeature (feature) {
    const { navigation } = this.props

    const name =
      feature.properties.name ||
      feature.properties['name:end'] ||
      feature.properties.brand

    return (
      <Feature
        onPress={() => navigation.navigate('ViewFeatureDetail', { feature })}
      >
        <FeatureText>
          {name && <NameText>{name}</NameText>}
          <BoldText>{getTaginfo(feature)}</BoldText>
          <Text>{feature.id}</Text>
        </FeatureText>
      </Feature>
    )
  }

  renderPhoto (photo) {
    const { navigation } = this.props
    const photoId = photo.properties.id
    function onPress () {
      navigation.navigate({ routeName: 'PhotoDetailScreen', params: { photo: photoId, previousScreen: 'Explore' } })
    }

    return (
      <Feature onPress={onPress}>
        <FeatureText>
          <NameText>Photo</NameText>
          <BoldText>{photo.properties.description}</BoldText>
          <Text>{formatDate(photo.properties.timestamp)}</Text>
        </FeatureText>
      </Feature>
    )
  }

  renderItem = (item) => {
    if (item.properties.type === 'photo') {
      return this.renderPhoto(item)
    } else {
      return this.renderFeature(item)
    }
  }

  render () {
    const { features, selectedFeatures, selectedPhotos } = this.props
    if ((selectedFeatures && selectedFeatures.length > 0) || (selectedPhotos && selectedPhotos.length > 0)) {
      const featureSection = { 'title': 'Features', 'data': selectedFeatures || features }
      const photoSection = { 'title': 'Photos', 'data': selectedPhotos }

      return (
        <Container pointerEvents={Platform.OS === 'ios' ? 'box-none' : 'auto'}>
          <Drawer
            startUp={false}
            containerHeight={300}
            offset={72}
            elevation={10}
          >
            <FeatureListWrapper>
              <Grabber />
              <ItemList
                sections={[featureSection, photoSection]}
                renderItem={({ item }) => { return this.renderItem(item) }}
                keyExtractor={(item, i) => item.properties.id + i}
              />
            </FeatureListWrapper>
          </Drawer>
        </Container>
      )
    } else {
      return <></>
    }
  }
}

const mapStateToProps = state => {
  return {
    selectedFeatures: state.map.selectedFeatures || false,
    selectedPhotos: state.map.selectedPhotos
  }
}

const mapDispatchToProps = {}

export default connect(mapStateToProps, mapDispatchToProps)(MapOverlay)
