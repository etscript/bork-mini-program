import Lean from '@/utils/lean'
import wepy from 'wepy'
import _isEmpty from 'lodash.isempty'
import {_daysToString} from '@/utils/age-fns'

export default class UserModel {
  constructor () {
    this.data = {}
    this.rescues = []
    this.rescueCount = null
    this.likes = []
    this.applications = []
    this.requests = []
    this.id = null
    this.currentUser()
  }

  async currentUser () {
    const current = Lean.User.current()
    if (current) {
      this.id = current.id
      this.data = current.toJSON()
    }
    return current
  }

  // GETTERS
  get isRegistered () {
    return !_isEmpty(this.data) && this.data.verified
  }

  get isVerified () {
    return !_isEmpty(this.data) && this.data.verified
  }

  get isRescuer () {
    return !_isEmpty(this.data) && this.data.isRescuer
  }

  get attributes () {
    return _isEmpty(this.data) ? null : this.data
  }

  get language () {
    return this.data.language || 'zh_CN'
  }

  get objectId () {
    return this.data.objectId || ''
  }

  get lastRescuePage () {
    return Math.ceil(this.rescueCount / 10)
  }

  // AUTHORIZATION & LOGIN SHIT
  async authorize () {
    const authData = await wepy.getSetting()
    if (!authData.authSetting['scope.userInfo']) {
      try {
        await wepy.authorize({scope: 'scope.userInfo'})
      } catch (err) {
        console.error(err)
        return Promise.reject(new Error(err))
      }
    }
    try {
      await this.logIn()
      return this.data
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async fetchUpdate () {
    const current = Lean.User.current()
    if (current) {
      const fetchedUser = await Lean.User.current().fetch()
      console.log(fetchedUser)
      this.data = fetchedUser.toJSON()
      return this.data
    }
  }

  async updateProfileInfo (params) {
    try {
      const updatedUser = await Lean.User.current().set(params).save()
      this.data = updatedUser.toJSON()
      return updatedUser
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async updateUserPass (password) {
    try {
      const res = await Lean.User.current().setPassword(password).save()
      await this.logIn()
      return res
    } catch (error) {
      return Promise.reject(error)
    }
  }

  async updateUsername (username) {
    try {
      const res = await Lean.User.current().setUsername(username).save()
      return res
    } catch (error) {
      return Promise.reject(error)
    }
  }

  async logIn () {
    try {
      const loginPromise = Lean.User.loginWithWeapp()
      const wxPromise = wepy.getUserInfo()
      const [loginInfo, {userInfo}] = await Promise.all([loginPromise, wxPromise]) // eslint-disable-line no-unused-vars
      const updatedUser = await Lean.User.current().set(userInfo).save()
      this.id = updatedUser.id
      this.data = updatedUser.toJSON()
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async signInWithWechat () {
    try {
      const loginPromise = Lean.User.loginWithWeapp()
      const wxPromise = wepy.getUserInfo()
      const [loginInfo, { userInfo }] = await Promise.all([loginPromise, wxPromise]) // eslint-disable-line no-unused-vars
      const verified = loginInfo.toJSON().verified
      if (!verified) {
        throw new Error('Not a user or not verified')
      }
      const updatedUser = await Lean.User.current().set(userInfo).save()
      this.id = updatedUser.id
      this.data = updatedUser.toJSON()
    } catch (err) {
      console.error(err)
      return Promise.reject(err)
    }
  }

  async manualSignIn ({username, password}) {
    try {
      const loginRes = await Lean.User.logIn(username, password)
      await Lean.User.current().linkWithWeapp()
      return loginRes
    } catch (error) {
      return Promise.reject(error)
    }
  }

  async logOut () {
    const clearStorage = wepy.clearStorage()
    const user = Lean.User.current()
    const logOut = user.logOut()
    await Promise.all([clearStorage, logOut])
    this.data = {}
  }

  // WX AUTHORIZATION STUFF
  async requestLocation () {
    const authData = await wepy.getSetting()
    if (!authData.authSetting['scope.userLocation']) {
      try {
        await wepy.authorize({scope: 'scope.userLocation'})
      } catch (err) {
        console.error(err)
        return Promise.reject(new Error(err))
      }
    }
  }

  async requestPicture () {
    const authData = await wepy.getSetting()
    if (!authData.authSetting['scope.camera']) {
      try {
        await wepy.authorize({scope: 'scope.camera'})
      } catch (err) {
        console.error(err)
        return Promise.reject(new Error(err))
      }
    }
  }

  async requestWritePhoto () {
    const authData = await wepy.getSetting()
    if (!authData.authSetting['scope.writePhotosAlbum']) {
      try {
        await wepy.authorize({scope: 'scope.writePhotosAlbum'})
      } catch (err) {
        console.error(err)
        return Promise.reject(new Error(err))
      }
    }
  }

  // RESCUES
  async createRescue () {
    const animal = new Lean.Object('Animal')
    const user = Lean.User.current()
    const available = true
    animal.set({user, available})
    const savedAnimal = await animal.save()
    return savedAnimal
  }

  async deleteRescue (objectId) {
    const animal = Lean.Object.createWithoutData('Animal', objectId)
    try {
      const deleteRes = await animal.destroy()
      return deleteRes
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async updateRescue (objectId, rawParams) {
    const {location, ...params} = rawParams
    const geoPoint = new Lean.GeoPoint(location)
    const animal = Lean.Object.createWithoutData('Animal', objectId)
    animal.set(params)
    animal.set({location: geoPoint})
    try {
      const animalRes = await animal.save()
      return animalRes.toJSON()
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async fetchRescues (page = 1, refresh = false) {
    // Return the rescues array if refresh is not required
    if (!_isEmpty(this.rescues) && !refresh) return this.rescues
    if (page === 1) this.rescues.length = 0
    const skipAmt = (page * 10) - 10
    const query = new Lean.Query('Animal')
    query.equalTo('user', Lean.User.current())
      .skip(skipAmt)
      .limit(10)
      .descending('createdAt')
    try {
      const countQuery = this.rescueCount ? setTimeout(() => console.log(this.rescueCount), 0) : query.count()
      const findQuery = query.find()
      const [countRes, findRes] = await Promise.all([countQuery, findQuery])
      this.rescueCount = countRes
      findRes.map(animal => {
        const animalObj = animal.toJSON()
        animalObj.age = _daysToString(animalObj.age)
        this.rescues.push(animalObj)
      })
      return this.rescues
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  // APPLICATIONS
  async fetchApplications (refresh = false) {
    if (!_isEmpty(this.applications) && !refresh) return this.applications
    try {
      const query = new Lean.Query('Application')
        .equalTo('applicant', Lean.User.current())
        .include(['animal', 'applicant', 'owner'])
        .select(['objectId',
          'status',
          'animal.objectId',
          'animal.images',
          'animal.name',
          'applicant.nickName'
        ])
        .descending('createdAt')
      const appsRes = await query.find()
      /*
        filter out applications which have a ghost node to an animal that has been deleted.
        In the future, refactor to move animals to deleted model or mark as deleted.
      */
      this.applications = appsRes.map(app => app.toJSON()).filter(app => app.animal)
      return this.applications
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async fetchApplication (id) {
    const query = new Lean.Query('Application')
      .include(['animal', 'applicant', 'owner'])
      .select([
        'status',
        'ownerMessage',
        'applicantMessage',
        'applicant.objectId',
        'applicant.nickName',
        'applicant.avatarUrl',
        'applicant.age',
        'applicant.province',
        'applicant.city',
        'applicant.gender',
        'applicant.isRescuer',
        'applicant.verified',
        'owner.nickName',
        'owner.objectId',
        'owner.avatarUrl',
        'owner.age',
        'owner.province',
        'owner.city',
        'owner.gender',
        'animal.name',
        'owner.isRescuer',
        'animal.objectId',
        'animal.images',
        'animal.age',
        'animal.ageUnit',
        'animal.neighborhood',
        'animal.type'
      ])
    try {
      const application = await query.get(id)
      return application.toJSON()
    } catch (err) {
      return Promise.reject(new Error(err))
    }
  }

  async submitApplication (animalId, ownerId, applicantMessage) {
    const application = new Lean.Object('Application')
    const applicant = Lean.User.current()
    const animal = Lean.Object.createWithoutData('Animal', animalId)
    const owner = Lean.Object.createWithoutData('User', ownerId)
    const acl = new Lean.ACL()
    acl.setWriteAccess(ownerId, true)
    acl.setWriteAccess(this.objectId, true)
    acl.setReadAccess(ownerId, true)
    acl.setReadAccess(this.objectId, true)
    application.set({applicant, owner, animal, applicantMessage})
    application.setACL(acl)
    try {
      const appRes = await application.save()
      this.applications.push(appRes.toJSON())
      return appRes.toJSON()
    } catch (err) {
      return Promise.reject(new Error(err))
    }
  }
  async deleteApplication (objectId) {
    const application = Lean.Object.createWithoutData('Application', objectId)
    try {
      const deleteRes = await application.destroy()
      const newApps = this.applications ? this.applications.filter(app => app.objectId !== objectId) : []
      this.applications = newApps
      console.log(this.applications)
      return deleteRes
    } catch (err) {
      return Promise.reject(new Error(err))
    }
  }
  // REQUESTS
  async fetchRequests (refresh = false) {
    if (!_isEmpty(this.requests) && !refresh) return this.requests
    try {
      const query = new Lean.Query('Application')
        .equalTo('owner', Lean.User.current())
        .include(['animal', 'applicant'])
        .select([
          'animal.name',
          'animal.images',
          'applicantMessage',
          'status',
          'applicant.nickName',
          'applicant.avatarUrl'])
        .descending('createdAt')
      const appsRes = await query.find()
      /*
        AGAIN filter out requests which have a ghost node to an animal that has been deleted.
        In the future, refactor to move animals to deleted model or mark as deleted.
      */
      this.requests = appsRes.map(app => app.toJSON()).filter(app => app.animal)
      return this.requests
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async respondToRequest (id, {status, ownerMessage}) {
    try {
      const application = Lean.Object.createWithoutData('Application', id)
      application.set({status, ownerMessage})
      const applicationRes = await application.save()
      return applicationRes.toJSON()
    } catch (err) {
      return Promise.reject(new Error(err))
    }
  }

  async fetchApplicationWechat (id, isOwner) {
    const selects = ['applicant.wxUsername', 'owner.wxUsername']
    const query = new Lean.Query('Application')
      .include(['animal', 'applicant', 'owner'])
      .select(selects)
    const res = await query.get(id)
    return res.toJSON()
  }

  // LIKES
  async fetchLikes (refresh = false, animalPage = false) {
    if (!_isEmpty(this.likes) && !refresh) return this.likes
    try {
      const query = new Lean.Query('Like')
        .equalTo('user', Lean.User.current())
        .include('animal')
        .descending('createdAt')
        .select(['id',
          'animal.objectId',
          'animal.images',
          'animal.name',
          'animal.gender',
          'animal.ageUnit',
          'animal.age'])
      const queryRes = await query.find()
      const likes = queryRes.map(like => like.toJSON())
        .filter(like => like.animal && !_isEmpty(like.animal))
      if (animalPage) {
        likes.map(like => {
          like.animal.age = _daysToString(like.animal.age)
          return like
        })
      }
      this.likes = likes
      return this.likes
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async submitLike (animalId) {
    const like = new Lean.Object('Like')
    const user = Lean.User.current()
    const animal = Lean.Object.createWithoutData('Animal', animalId)
    like.set({user, animal})
    try {
      const likeRes = await like.save()
      this.likes.push(likeRes.toJSON())
      return likeRes
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async submitUnLike (animalId) {
    const likeId = this.likes.find(like => like.animal.objectId === animalId).objectId
    const like = Lean.Object.createWithoutData('Like', likeId)
    try {
      const destroyRes = await like.destroy()
      return destroyRes
    } catch (err) {
      console.error(err)
      return Promise.reject(new Error(err))
    }
  }

  async uploadPicture (tmpPath) {
    const name = `${this.objectId}_avatar`
    const file = new Lean.File(name, {
      blob: {
        uri: tmpPath
      }
    })
    const fileRes = await file.save()
    return fileRes.toJSON()
  }
}
